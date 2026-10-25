const catchAsync = require("../utils/asyncHandler");
const env = require("../config/env");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseInboundWebhook,
} = require("../services/whatsappCloudApiService");
const { sendGreetingForAccount } = require("../services/whatsappGreetingService");
const { recordMessage, applyReactionToMessage } = require("../services/whatsappConversationService");
const { maybeReplyWithAI } = require("../services/whatsappAIService");
const { formatCopyCodeMessage } = require("../services/whatsappFormatService");
const { sendTextMessage } = require("../services/whatsappCloudApiService");
const { logger } = require("../utils/logger");

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

  res.status(200).json({ success: true });

  if (!env.whatsapp.enabled) {
    logger.info("whatsapp.webhook.ignored_disabled");
    return;
  }

  const events = parseInboundWebhook(payload);
  for (const event of events) {
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

      const inboundType = event.isWelcomeRequest
        ? "text"
        : ["image", "document", "audio", "video", "sticker", "interactive", "button"].includes(event.type)
          ? event.type
          : "text";

      const { conversation, duplicate } = await recordMessage({
        accountId: account._id,
        customerWaId: event.customerWaId,
        customerName: event.customerName,
        direction: "inbound",
        sender: "customer",
        type: event.isWelcomeRequest ? "text" : inboundType,
        text: event.isWelcomeRequest ? "[Chat opened]" : (event.text || ""),
        waMessageId: event.messageId,
        meta: {
          isWelcomeRequest: Boolean(event.isWelcomeRequest),
          rawType: event.type,
          mediaId: event.mediaId || "",
        },
      });

      if (duplicate) continue;

      if (event.buttonReplyId?.startsWith("copy:")) {
        const code = event.buttonReplyId.slice(5).trim();
        if (code) {
          const text = formatCopyCodeMessage(code, "Your code");
          const result = await sendTextMessage({
            phoneNumberId: account.phoneNumberId,
            accessToken: account.accessToken,
            to: event.customerWaId,
            text,
          });
          await recordMessage({
            accountId: account._id,
            conversationId: conversation._id,
            customerWaId: event.customerWaId,
            direction: "outbound",
            sender: "system",
            type: "text",
            text,
            waMessageId: result?.messages?.[0]?.id || "",
            meta: { copyCode: code },
          });
        }
        continue;
      }

      // First chat open (Meta request_welcome) OR first real message → greeting sequence
      const greetingResult = await sendGreetingForAccount({
        account,
        customerWaId: event.customerWaId,
        force: Boolean(event.isWelcomeRequest),
        onOutbound: async (item) => {
          await recordMessage({
            accountId: account._id,
            conversationId: conversation._id,
            customerWaId: event.customerWaId,
            direction: "outbound",
            sender: "system",
            type: item.type || "text",
            text: item.text || "",
            mediaUrl: item.mediaUrl || "",
            buttons: item.buttons || [],
            waMessageId: item.result?.messages?.[0]?.id || "",
            meta: { greeting: true },
          });
        },
      });

      if (greetingResult.sent) {
        conversation.greetingSentAt = new Date();
        await conversation.save();
      }

      // Welcome-only open: greeting is enough. Real questions → AI.
      if (event.isWelcomeRequest) continue;
      if (!event.text && !event.buttonReplyId) continue;

      const aiInput = event.text
        || (event.buttonReplyId ? `Button: ${event.buttonReplyId}` : "");
      if (!aiInput) continue;

      await maybeReplyWithAI({
        account,
        conversation,
        customerMessage: aiInput,
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
