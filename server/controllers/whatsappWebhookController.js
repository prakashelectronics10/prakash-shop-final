const catchAsync = require("../utils/asyncHandler");
const env = require("../config/env");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  parseInboundWebhook,
} = require("../services/whatsappCloudApiService");
const {
  sendGreetingForAccount,
  handleCopyCodeReply,
} = require("../services/whatsappGreetingService");
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
  // Always ACK quickly; process after respond when possible.
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

  // Respond immediately so Meta does not retry.
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

      if (event.buttonReplyId) {
        const handled = await handleCopyCodeReply({
          account,
          customerWaId: event.customerWaId,
          buttonReplyId: event.buttonReplyId,
        });
        if (handled) continue;
      }

      await sendGreetingForAccount({
        account,
        customerWaId: event.customerWaId,
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
