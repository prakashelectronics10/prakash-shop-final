const catchAsync = require("../utils/asyncHandler");
const env = require("../config/env");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseInboundWebhook,
  sendTextMessage,
  sendInteractiveMessage,
} = require("../services/whatsappCloudApiService");
const { recordMessage, applyReactionToMessage } = require("../services/whatsappConversationService");
const { maybeReplyWithAI } = require("../services/whatsappAIService");
const {
  handlePaymentIssueFlow,
  resolveCopyCodeFromConversation,
  sendCopyCodeReply,
} = require("../services/whatsappTransactionalService");
const { logger } = require("../utils/logger");
const { recordDeliveryReceipts } = require("../services/whatsappDeliveryService");
const { isSignedReviewAction, getContextReviewAction, handleReviewAction } = require("../services/reviewWhatsAppService");
const voice = require("../services/whatsappVoiceService");

function requestsOrderHistory(text = "") {
  const message = text.toLowerCase().trim().replace(/[.!?]+$/, "");
  return /^(?:my orders|order history|all orders|view orders|view all orders)$/.test(message)
    || /\b(?:show|view|see|list|check|get)\b.*\b(?:my|all|previous|past)\b.*\borders\b/.test(message)
    || (/\borders?\b|ऑर्डर/.test(message)
      && /\b(?:saar[aei]|sar[aei]|sabh?i|sab|purane|history)\b|सारे|सभी|पुराने|इतिहास/.test(message))
    || (/\borders\b/.test(message) && /\b(?:mer[aei]|mujhe)\b/.test(message)
      && /\b(?:dikha\w*|dekh\w*|bata\w*)\b/.test(message));
}

async function sendOrderHistoryButton({ account, conversation, customerWaId }) {
  const url = new URL("/orders", env.productionUrl).href;
  const text = "Apne orders track karne ke liye View orders tap karein.";
  const result = await sendInteractiveMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: customerWaId,
    interactive: {
      type: "cta_url",
      body: { text },
      action: { name: "cta_url", parameters: { display_text: "View orders", url } },
    },
  });
  await recordMessage({
    accountId: account._id, conversationId: conversation._id, customerWaId,
    direction: "outbound", sender: "system", type: "interactive", text,
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "order_history_link" },
  });
}

async function ensureAccountFromEnv(phoneNumberId) {
  if (!env.whatsapp.phoneNumberId || !env.whatsapp.accessToken) return null;
  if (String(phoneNumberId) !== String(env.whatsapp.phoneNumberId)) return null;
  if (!env.whatsapp.businessAccountId) return null;

  return WhatsAppAccount.findOneAndUpdate(
    { phoneNumberId: env.whatsapp.phoneNumberId },
    {
      $setOnInsert: {
        label: "Primary (from .env)",
        phoneNumberId: env.whatsapp.phoneNumberId,
        businessAccountId: env.whatsapp.businessAccountId,
        accessToken: env.whatsapp.accessToken,
        isActive: true,
        notes: "Auto-created from server environment on first webhook",
      },
    },
    { upsert: true, new: true },
  );
}

async function resolveAccountByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const account = await WhatsAppAccount.findOne({
    phoneNumberId: String(phoneNumberId),
    isActive: true,
  });
  if (account) return account;
  return ensureAccountFromEnv(phoneNumberId);
}

function looksLikeCopyButton(buttonReplyId = "", text = "") {
  const id = String(buttonReplyId || "").toLowerCase();
  const title = String(text || "").toLowerCase();
  if (id.startsWith("copy:")) return true;
  return title.includes("copy booking")
    || title.includes("copy order")
    || title === "copy booking id"
    || title === "copy order id";
}

exports.verifyWhatsAppWebhook = catchAsync(async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verified = verifyWebhookChallenge({ mode, token, challenge });
  if (verified == null) {
    return res.status(403).send("Forbidden");
  }
  return res.status(200).send(verified);
});

exports.handleWhatsAppWebhook = catchAsync(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));

  if (env.metaApp.appSecret) {
    const signature = req.get("x-hub-signature-256");
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn("whatsapp.webhook.invalid_signature");
      return res.status(403).json({ success: false, message: "Invalid signature" });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (_error) {
    return res.status(400).json({ success: false, message: "Invalid JSON" });
  }

  if (!env.whatsapp.enabled) {
    logger.info("whatsapp.webhook.ignored_disabled");
    return res.status(200).json({ success: true });
  }

  if (env.pulseVoice.enabled && voice.configurationReady()) {
    const calls = voice.parseCallEvents(payload);
    try {
      if (calls.length) await voice.ensureIndexes();
      for (const call of calls) {
        const work = await voice.receive(call);
        if (work) void work().catch(() => logger.warn("whatsapp.voice.event_failed"));
      }
    } catch {
      logger.warn("whatsapp.voice.webhook_retry");
      return res.status(503).json({ success: false, message: "Calling temporarily unavailable" });
    }
  }

  const conversationEvents = [];
  const reviewReplies = [];
  for (const event of parseInboundWebhook(payload)) {
    const signedReviewAction = isSignedReviewAction(event.buttonReplyId);
    if (env.metaApp.appSecret && (signedReviewAction || getContextReviewAction(event))) {
      try {
        const account = await resolveAccountByPhoneNumberId(event.phoneNumberId);
        const reply = account && await handleReviewAction({ account, event });
        if (reply) {
          reviewReplies.push(reply);
          continue;
        }
      } catch (error) {
        // A failed write must remain retryable by Meta.
        logger.error("review_whatsapp.action_failed", { code: error.code, messageId: event.messageId });
        return res.status(503).json({ success: false, message: "Review action temporarily unavailable" });
      }
    }
    if (!signedReviewAction) conversationEvents.push(event);
  }

  res.status(200).json({ success: true });

  await Promise.all(reviewReplies.map((reply) => sendTextMessage(reply).catch((error) => {
    logger.warn("review_whatsapp.reply_failed", { status: error.status, metaCode: error.payload?.error?.code });
  })));

  if (env.metaApp.appSecret) {
    await recordDeliveryReceipts(payload).catch((error) => {
      logger.warn("whatsapp.delivery_status_write_failed", { code: error.code });
    });
  }

  for (const event of conversationEvents) {
    if (event.isWelcomeRequest) continue;
    try {
      const account = await resolveAccountByPhoneNumberId(event.phoneNumberId);
      if (!account) {
        logger.warn("whatsapp.webhook.unknown_phone", { phoneNumberId: event.phoneNumberId });
        continue;
      }

      if (event.isReaction) {
        await applyReactionToMessage({
          targetWaMessageId: event.reactionTargetWaMessageId,
          emoji: event.reactionEmoji,
          fromWaId: event.customerWaId,
          fromName: event.customerName,
        });
        continue;
      }

      const inboundType = ["image", "document", "audio", "video", "sticker", "interactive", "button"].includes(event.type)
        ? event.type : "text";

      const { conversation, duplicate } = await recordMessage({
        accountId: account._id,
        customerWaId: event.customerWaId,
        customerName: event.customerName,
        direction: "inbound",
        sender: "customer",
        type: inboundType,
        text: event.text || "",
        waMessageId: event.messageId,
        mediaMimeType: event.mediaMimeType || "",
        mediaFilename: event.mediaFilename || "",
        meta: {
          receivedAt: Number.isFinite(+event.timestamp) ? event.timestamp : new Date(),
          rawType: event.type,
          mediaId: event.mediaId || "",
          channel: "whatsapp",
        },
      });

      if (duplicate) continue;

      if (event.type === "text" && requestsOrderHistory(event.text)) {
        await sendOrderHistoryButton({ account, conversation, customerWaId: event.customerWaId });
        continue;
      }

      // Copy Booking ID / Copy Order ID (interactive or template quick reply)
      if (looksLikeCopyButton(event.buttonReplyId, event.text)) {
        const code = await resolveCopyCodeFromConversation(
          conversation,
          event.buttonReplyId,
          event.text,
        );
        if (code) {
          const label = String(event.text || "").toLowerCase().includes("order")
            ? "Order ID"
            : String(event.text || "").toLowerCase().includes("booking")
              ? "Booking ID"
              : "Code";
          await sendCopyCodeReply({ account, conversation, code, label });
        }
        continue;
      }

      // Payment unsuccessful guided flow / WhatsApp Flow reply — skip greeting + normal AI
      const paymentFlow = await handlePaymentIssueFlow({
        account,
        conversation,
        customerMessage: event.text || "",
        buttonReplyId: event.buttonReplyId || "",
        isFlowReply: Boolean(event.isFlowReply),
        flowReplyBody: event.flowReplyBody || "",
        flowReplyResponseJson: event.flowReplyResponseJson || "",
      });
      if (paymentFlow.handled) continue;

      // Other WhatsApp Flow replies (e.g. customer_review) — thank them, no greeting/AI spam
      if (event.isFlowReply) {
        const thanks = "Dhanyavaad! Aapka feedback mil gaya. Hum isse better banane ke liye use karenge.";
        const result = await sendTextMessage({
          phoneNumberId: account.phoneNumberId,
          accessToken: account.accessToken,
          to: event.customerWaId,
          text: thanks,
        });
        await recordMessage({
          accountId: account._id,
          conversationId: conversation._id,
          customerWaId: event.customerWaId,
          direction: "outbound",
          sender: "system",
          type: "text",
          text: thanks,
          waMessageId: result?.messages?.[0]?.id || "",
          meta: { kind: "flow_thanks", flowName: event.flowReplyName || "" },
        });
        continue;
      }

      if (!event.text && !event.buttonReplyId && !(["image", "audio"].includes(event.type) && event.mediaId)) continue;

      const aiInput = event.text
        || (event.buttonReplyId ? `Button: ${event.buttonReplyId}` : "");
      if (!aiInput && !event.mediaId) continue;

      await maybeReplyWithAI({
        account,
        conversation,
        customerMessage: aiInput,
        buttonReplyId: event.buttonReplyId,
        media: event.mediaId ? { id: event.mediaId, type: event.type, mimeType: event.mediaMimeType, messageId: event.messageId } : null,
      });
    } catch (error) {
      logger.error("whatsapp.webhook.event_failed", {
        message: error.message,
        phoneNumberId: event.phoneNumberId,
        customerWaId: event.customerWaId,
      });
    }
  }
});
