const crypto = require("crypto");
const env = require("../config/env");
const { logger } = require("../utils/logger");

function graphBase() {
  const version = env.whatsapp.graphApiVersion || "v26.0";
  return `https://graph.facebook.com/${version}`;
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = env.metaApp.appSecret;
  if (!secret) return false;
  const provided = String(signatureHeader || "");
  if (!provided.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(provided.slice(7));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyWebhookChallenge({ mode, token, challenge }) {
  if (mode !== "subscribe") return null;
  if (!env.whatsapp.webhookVerifyToken) return null;
  if (String(token || "") !== env.whatsapp.webhookVerifyToken) return null;
  return String(challenge || "");
}

async function graphRequest({ phoneNumberId, businessAccountId, accessToken, path = "messages", method = "POST", body, query, timeoutMs }) {
  const formBody = body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || env.whatsapp.requestTimeoutMs || 15000);
  try {
    const qs = query
      ? `?${new URLSearchParams(
        Object.entries(query).reduce((acc, [key, value]) => {
          if (value === undefined || value === null) return acc;
          acc[key] = typeof value === "string" ? value : JSON.stringify(value);
          return acc;
        }, {}),
      ).toString()}`
      : "";
    const response = await fetch(`${graphBase()}/${businessAccountId || phoneNumberId}${path ? `/${path}` : ""}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body && !formBody ? { "Content-Type": "application/json" } : {}),
      },
      body: formBody ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || `WhatsApp API error (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWhatsAppPayload({ phoneNumberId, accessToken, to, type, payload }) {
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: String(to).replace(/\D/g, ""),
    type,
    [type]: payload,
  };
  logger.info("whatsapp.send", { phoneNumberId, type, to: body.to });
  return graphRequest({ phoneNumberId, accessToken, body });
}

async function sendTextMessage({ phoneNumberId, accessToken, to, text }) {
  return sendWhatsAppPayload({
    phoneNumberId,
    accessToken,
    to,
    type: "text",
    payload: { preview_url: true, body: String(text || "").slice(0, 4096) },
  });
}

async function sendImageMessage({ phoneNumberId, accessToken, to, imageUrl, caption = "" }) {
  return sendWhatsAppPayload({
    phoneNumberId,
    accessToken,
    to,
    type: "image",
    payload: {
      link: imageUrl,
      ...(caption ? { caption: String(caption).slice(0, 1024) } : {}),
    },
  });
}

async function uploadPdfMedia({ phoneNumberId, accessToken, pdf, filename }) {
  const body = new FormData();
  body.set("messaging_product", "whatsapp");
  body.set("type", "application/pdf");
  body.set("file", new Blob([pdf], { type: "application/pdf" }), filename);
  const response = await graphRequest({ phoneNumberId, accessToken, path: "media", body });
  if (!response.id) throw new Error("WhatsApp did not return an invoice media ID");
  return response.id;
}

async function getMessageTemplateStatus({ businessAccountId, accessToken, templateName, languageCode }) {
  const result = await graphRequest({
    businessAccountId, accessToken, method: "GET", path: "message_templates",
    query: { name: templateName, fields: "name,language,status" },
  });
  return result.data?.find((template) => template.name === templateName && template.language === languageCode)?.status || "NOT_FOUND";
}

function isWhatsAppTemplateTemporarilyUnavailable(error) {
  return [132001, 132015].includes(Number(error?.payload?.error?.code));
}

const billingChecks = new Map();

async function hasWhatsAppBillingBlock({ businessAccountId, accessToken }) {
  if (!businessAccountId) return false;
  const cached = billingChecks.get(businessAccountId);
  if (cached?.expiresAt > Date.now()) return cached.blocked;
  try {
    const data = await graphRequest({
      businessAccountId, accessToken, path: "", method: "GET", query: { fields: "health_status" }, timeoutMs: 2200,
    });
    const blocked = data.health_status?.entities?.some((entity) => entity.entity_type === "WABA"
      && entity.can_send_message === "BLOCKED"
      && entity.errors?.some((error) => error.error_code === 141006)) === true;
    if (data.health_status) billingChecks.set(businessAccountId, { blocked, expiresAt: Date.now() + 15000 });
    return blocked;
  } catch (_error) {
    return false;
  }
}

async function sendDocumentMessage({ phoneNumberId, accessToken, to, documentUrl, filename = "file", caption = "" }) {
  return sendWhatsAppPayload({
    phoneNumberId,
    accessToken,
    to,
    type: "document",
    payload: {
      link: documentUrl,
      filename: String(filename || "file").slice(0, 240),
      ...(caption ? { caption: String(caption).slice(0, 1024) } : {}),
    },
  });
}

async function sendInteractiveMessage({ phoneNumberId, accessToken, to, interactive }) {
  return sendWhatsAppPayload({
    phoneNumberId,
    accessToken,
    to,
    type: "interactive",
    payload: interactive,
  });
}

async function sendTemplateMessage({
  phoneNumberId,
  accessToken,
  to,
  templateName,
  languageCode = "en",
  components = [],
}) {
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: String(to).replace(/\D/g, ""),
    type: "template",
    template: {
      name: String(templateName || "").trim(),
      language: { code: String(languageCode || "en") },
      ...(components.length ? { components } : {}),
    },
  };
  logger.info("whatsapp.send_template", {
    phoneNumberId,
    to: body.to,
    templateName: body.template.name,
    languageCode: body.template.language.code,
  });
  return graphRequest({ phoneNumberId, accessToken, body });
}

async function configureConversationalAutomation({ phoneNumberId, accessToken, enableWelcomeMessage, prompts = [] }) {
  const cleanPrompts = (Array.isArray(prompts) ? prompts : [])
    .map((item) => String(item || "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 4);

  const body = {
    enable_welcome_message: Boolean(enableWelcomeMessage),
  };
  if (cleanPrompts.length) {
    body.prompts = cleanPrompts;
  }

  logger.info("whatsapp.conversational_automation", {
    phoneNumberId,
    enableWelcomeMessage: body.enable_welcome_message,
    prompts: cleanPrompts.length,
  });

  return graphRequest({
    phoneNumberId,
    accessToken,
    path: "conversational_automation",
    method: "POST",
    body,
  });
}

function extractInboundMedia(message) {
  const type = String(message?.type || "");
  const media = message?.[type] || {};
  return {
    mediaId: String(media.id || ""),
    caption: String(media.caption || "").trim(),
    mimeType: String(media.mime_type || ""),
    filename: String(media.filename || ""),
  };
}

function parseInboundWebhook(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  const events = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field !== "messages") continue;
      const value = change.value || {};
      const metadata = value.metadata || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        const contact = contacts.find((item) => item.wa_id === message.from) || contacts[0] || {};
        const type = String(message.type || "");
        const media = extractInboundMedia(message);
        const isWelcome = type === "request_welcome";
        const isReaction = type === "reaction";
        events.push({
          phoneNumberId: String(metadata.phone_number_id || ""),
          displayPhoneNumber: String(metadata.display_phone_number || ""),
          customerWaId: String(message.from || ""),
          customerName: String(contact?.profile?.name || ""),
          messageId: String(message.id || ""),
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
          type,
          isWelcomeRequest: isWelcome,
          isReaction,
          reactionEmoji: isReaction ? String(message.reaction?.emoji || "") : "",
          reactionTargetWaMessageId: isReaction ? String(message.reaction?.message_id || "") : "",
          text: String(
            message.text?.body
            || message.button?.text
            || message.interactive?.button_reply?.title
            || message.interactive?.nfm_reply?.body
            || message.interactive?.nfm_reply?.name
            || media.caption
            || "",
          ).trim(),
          buttonReplyId: String(message.interactive?.button_reply?.id || message.button?.payload || "").trim(),
          isFlowReply: type === "interactive" && Boolean(message.interactive?.nfm_reply),
          flowReplyName: String(message.interactive?.nfm_reply?.name || "").trim(),
          flowReplyBody: String(message.interactive?.nfm_reply?.body || "").trim(),
          flowReplyResponseJson: String(message.interactive?.nfm_reply?.response_json || "").trim(),
          mediaId: media.mediaId,
          mediaMimeType: media.mimeType,
          mediaFilename: media.filename,
          raw: message,
        });
      }
    }
  }

  return events;
}

module.exports = {
  verifyWebhookSignature,
  verifyWebhookChallenge,
  sendTextMessage,
  sendImageMessage,
  uploadPdfMedia,
  sendDocumentMessage,
  sendInteractiveMessage,
  sendTemplateMessage,
  getMessageTemplateStatus,
  isWhatsAppTemplateTemporarilyUnavailable,
  hasWhatsAppBillingBlock,
  configureConversationalAutomation,
  parseInboundWebhook,
  graphRequest,
};
