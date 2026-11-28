const env = require("../config/env");
const Conversation = require("../models/WhatsAppConversation");
const { graphRequest, sendTemplateMessage } = require("./whatsappCloudApiService");
const { recordMessage } = require("./whatsappConversationService");
const voice = require("./whatsappVoiceService");
const { logger } = require("../utils/logger");

const template = { id: "1646212583946864", name: "call_request_to_customer", language: "en_US" };
const day = 24 * 60 * 60_000;

function isPermissionReply(event) {
  return event.raw?.interactive?.type === "call_permission_reply";
}

function createPermissionService({ config = env.pulseVoice, conversations = Conversation, calling = voice,
  graph = graphRequest, send = sendTemplateMessage, record = recordMessage } = {}) {
  function matchesSender(account, customerWaId) {
    return config.enabled && config.outboundEnabled && calling.configurationReady()
      && account?.phoneNumberId === config.phoneNumberId && account.businessAccountId === config.businessAccountId
      && /^91[6-9]\d{9}$/.test(customerWaId);
  }

  function permissionState(customerWaId) {
    return graph({ phoneNumberId: config.phoneNumberId, accessToken: config.accessToken, method: "GET",
      path: "call_permissions", query: { user_wa_id: customerWaId }, timeoutMs: 5000 });
  }

  async function sendAfterGreeting({ account, conversation, customerWaId }) {
    if (!matchesSender(account, customerWaId) || !await calling.getSettings().then((settings) => settings.enabled)) return;
    const scope = { _id: conversation._id, account: account._id, customerWaId, humanTakeover: { $ne: true }, aiEnabled: { $ne: false } };
    const claimed = await conversations.updateOne({ ...scope, "voicePermission.status": { $exists: false } },
      { $set: { "voicePermission.status": "sending" } });
    if (!claimed.modifiedCount) return;
    try {
      const permission = await permissionState(customerWaId);
      if (!permission.actions?.some((action) => action.action_name === "send_call_permission_request" && action.can_perform_action === true)) {
        await conversations.updateOne(scope, { $set: { "voicePermission.status": "unavailable" } });
        return;
      }
      const info = await graph({ businessAccountId: template.id, path: "", method: "GET", accessToken: config.accessToken,
        query: { fields: "id,name,language,status,components" }, timeoutMs: 5000 });
      if (String(info.id) !== template.id || info.name !== template.name || info.language !== template.language
        || info.status !== "APPROVED" || !info.components?.some((part) => part.type === "CALL_PERMISSION_REQUEST")) {
        throw new Error("Call permission template unavailable");
      }
      const response = await send({ phoneNumberId: config.phoneNumberId, accessToken: config.accessToken, to: customerWaId,
        templateName: template.name, languageCode: template.language });
      const messageId = response.messages?.[0]?.id;
      if (!messageId) throw new Error("Call permission request rejected");
      await conversations.updateOne(scope, { $set: { voicePermission: { status: "waiting", messageId, sentAt: new Date() } } });
      await record({ accountId: account._id, conversationId: conversation._id, customerWaId, direction: "outbound",
        sender: "system", type: "interactive", waMessageId: messageId, text: "WhatsApp call permission requested",
        meta: { kind: "call_permission_request", template: template.name } });
    } catch (error) {
      await conversations.updateOne({ ...scope, "voicePermission.status": "sending" }, { $set: { "voicePermission.status": "failed" } });
      logger.warn("whatsapp.voice.permission_request_failed", { status: error.status, metaCode: error.payload?.error?.code });
    }
  }

  async function prepareReply({ account, event }) {
    if (!isPermissionReply(event) || !matchesSender(account, event.customerWaId)) return;
    const reply = event.raw.interactive.call_permission_reply;
    const requestId = event.raw.context?.id;
    const now = Date.now();
    const timestamp = Number(event.raw.timestamp) * 1000;
    if (reply?.response_source !== "user_action" || !["accept", "reject"].includes(reply.response)
      || typeof requestId !== "string" || !requestId || !Number.isFinite(timestamp) || Math.abs(now - timestamp) > 5 * 60_000) return;
    if (reply.response === "accept" && reply.is_permanent !== true
      && !(Number(reply.expiration_timestamp) * 1000 > now)) return;
    const scope = { account: account._id, customerWaId: event.customerWaId,
      "voicePermission.messageId": requestId, "voicePermission.status": "waiting",
      "voicePermission.sentAt": { $gte: new Date(now - 7 * day) } };
    const update = await conversations.updateOne({ ...scope,
      ...(reply.response === "accept" && { humanTakeover: { $ne: true }, aiEnabled: { $ne: false } }),
    }, { $set: { "voicePermission.status": reply.response === "accept" ? "accepted" : "declined" } });
    if (!update.modifiedCount || reply.response !== "accept") return;

    return async () => {
      let dialed = false;
      try {
        const permission = await permissionState(event.customerWaId);
        if (["temporary", "permanent"].includes(permission.permission?.status)
          && permission.actions?.some((action) => action.action_name === "start_call" && action.can_perform_action === true)) {
          await calling.ensureIndexes();
          dialed = await calling.startOutbound(event.customerWaId);
        }
      } catch (error) {
        logger.warn("whatsapp.voice.permission_dial_failed", { status: error.status, metaCode: error.payload?.error?.code });
      }
      await conversations.updateOne({ account: account._id, customerWaId: event.customerWaId, "voicePermission.messageId": requestId,
        "voicePermission.status": "accepted" }, { $set: { "voicePermission.status": dialed ? "dialed" : "call_unavailable" } });
    };
  }

  return { sendAfterGreeting, prepareReply };
}

module.exports = { ...createPermissionService(), createPermissionService, isPermissionReply };
