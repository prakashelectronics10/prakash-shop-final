const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const WhatsAppGreeting = require("../models/WhatsAppGreeting");
const WhatsAppGreetingLog = require("../models/WhatsAppGreetingLog");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const WhatsAppVoiceCall = require("../models/WhatsAppVoiceCall");
const {
  sendTextMessage,
  sendImageMessage,
  sendInteractiveMessage,
  sendTemplateMessage,
  configureConversationalAutomation,
} = require("./whatsappCloudApiService");
const { formatCopyCodeMessage, markdownToWhatsApp } = require("./whatsappFormatService");
const { logger } = require("../utils/logger");

function sanitizeButtons(buttons = []) {
  return (Array.isArray(buttons) ? buttons : [])
    .filter((button) => button && button.label && button.type)
    .slice(0, 3)
    .map((button, index) => ({
      id: String(button.id || `btn_${index + 1}`).slice(0, 80),
      type: button.type,
      label: String(button.label).trim().slice(0, 20),
      url: String(button.url || "").trim(),
      code: String(button.code || "").trim().slice(0, 15),
      payload: String(button.payload || "").trim().slice(0, 80),
    }));
}

function sanitizeGreetingMessage(message, index = 0) {
  const imageUrls = [
    ...(Array.isArray(message?.imageUrls) ? message.imageUrls : []),
    message?.imageUrl || "",
  ]
    .map((url) => String(url || "").trim())
    .filter(Boolean);
  const uniqueUrls = [...new Set(imageUrls)];

  return {
    id: String(message?.id || `msg_${index + 1}`).slice(0, 80),
    type: ["text", "image", "interactive"].includes(message?.type) ? message.type : "text",
    bodyText: String(message?.bodyText || "").trim().slice(0, 1024),
    headerText: String(message?.headerText || "").replace(/[\r\n]+/g, " ").trim().slice(0, 60),
    footerText: String(message?.footerText || "").trim().slice(0, 60),
    imageUrl: uniqueUrls[0] || "",
    imagePublicId: String(message?.imagePublicId || "").trim(),
    imageSourceUrl: String(message?.imageSourceUrl || "").trim(),
    imageUrls: uniqueUrls,
    imagePublicIds: (Array.isArray(message?.imagePublicIds) ? message.imagePublicIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
    buttons: sanitizeButtons(message?.buttons),
  };
}

function normalizeGreetingMessages(greeting) {
  const configured = Array.isArray(greeting?.messages) ? greeting.messages : [];
  if (configured.length) {
    return configured.map((item, index) => sanitizeGreetingMessage(item, index))
      .filter((item) => item.headerText || item.bodyText || item.imageUrls.length || item.buttons.length);
  }

  // Legacy single-message shape → one sequence step
  const legacy = sanitizeGreetingMessage({
    id: "legacy_1",
    type: greeting?.buttons?.length ? "interactive" : (greeting?.imageUrl ? "image" : "text"),
    bodyText: greeting?.bodyText,
    headerText: greeting?.headerText,
    footerText: greeting?.footerText,
    imageUrl: greeting?.imageUrl,
    imagePublicId: greeting?.imagePublicId,
    imageSourceUrl: greeting?.imageSourceUrl,
    buttons: greeting?.buttons,
  }, 0);

  return (legacy.headerText || legacy.bodyText || legacy.imageUrls.length || legacy.buttons.length) ? [legacy] : [];
}

function buildInteractivePlan(step) {
  const bodyText = markdownToWhatsApp(step.bodyText);
  const footerText = step.footerText;
  const headerText = step.headerText;
  const imageUrl = step.imageUrls[0] || "";
  const buttons = step.buttons;
  const header = headerText ? { type: "text", text: headerText }
    : imageUrl ? { type: "image", image: { link: imageUrl } } : undefined;
  const extraImages = step.imageUrls.slice(header?.type === "image" ? 1 : 0);
  const composedText = [headerText && `*${headerText}*`, bodyText, footerText].filter(Boolean).join("\n\n");
  const urlButtons = buttons.filter((button) => button.type === "url" && button.url);
  const copyButtons = buttons.filter((button) => button.type === "copy_code" && button.code);
  const replyButtons = buttons.filter((button) => button.type === "quick_reply");

  // Native clipboard copy on WhatsApp requires approved AUTH/marketing templates.
  // For session messages we send a monospace code block (tap-and-hold to copy).
  const copyFollowUps = copyButtons.map((button) => ({
    text: formatCopyCodeMessage(button.code, button.label || "Your code"),
    code: button.code,
  }));

  if (urlButtons.length === 1 && replyButtons.length === 0) {
    const button = urlButtons[0];
    return {
      mode: "interactive",
      interactive: {
        type: "cta_url",
        ...(header ? { header } : {}),
        body: { text: bodyText || button.label },
        ...(footerText ? { footer: { text: footerText } } : {}),
        action: {
          name: "cta_url",
          parameters: { display_text: button.label, url: button.url },
        },
      },
      extraImages,
      copyFollowUps,
    };
  }

  if (replyButtons.length) {
    return {
      mode: "interactive",
      interactive: {
        type: "button",
        ...(header ? { header } : {}),
        body: { text: bodyText || "Welcome!" },
        ...(footerText ? { footer: { text: footerText } } : {}),
        action: {
          buttons: replyButtons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: {
              id: String(button.payload || button.id).slice(0, 256),
              title: button.label,
            },
          })),
        },
      },
      followUpUrls: urlButtons,
      extraImages,
      copyFollowUps,
    };
  }

  if (step.imageUrls.length && composedText.length <= 1024) {
    return {
      mode: "images",
      imageUrls: step.imageUrls,
      caption: composedText,
      copyFollowUps,
      followUpUrls: urlButtons,
    };
  }

  if (composedText || copyFollowUps.length || urlButtons.length) {
    return {
      mode: "text",
      text: composedText,
      copyFollowUps,
      followUpUrls: urlButtons,
      extraImages: step.imageUrls,
    };
  }

  return null;
}

/** @deprecated kept for tests */
function buildInteractiveFromGreeting(greeting) {
  const steps = normalizeGreetingMessages(greeting);
  if (!steps.length) return null;
  return buildInteractivePlan(steps[0]);
}

async function sendPlanFollowUps(creds, plan, sent) {
  for (const button of plan.followUpUrls || []) {
    const text = `${button.label}: ${button.url}`;
    const resultText = await sendTextMessage({ ...creds, text });
    sent.push({ type: "text", result: resultText, text });
  }
  for (const imageUrl of plan.extraImages || []) {
    const resultImage = await sendImageMessage({ ...creds, imageUrl });
    sent.push({ type: "image", result: resultImage, mediaUrl: imageUrl });
  }
  for (const copy of plan.copyFollowUps || []) {
    const resultCopy = await sendTextMessage({ ...creds, text: copy.text });
    sent.push({ type: "text", result: resultCopy, text: copy.text, meta: { copyCode: copy.code } });
  }
}

async function sendGreetingStep(creds, step, sent) {
  const plan = buildInteractivePlan(step);
  if (!plan) return;

  if (plan.mode === "interactive") {
    const result = await sendInteractiveMessage({ ...creds, interactive: plan.interactive });
    sent.push({ type: "interactive", result, text: [step.headerText, step.bodyText, step.footerText].filter(Boolean).join("\n\n"), buttons: step.buttons });
    await sendPlanFollowUps(creds, plan, sent);
  } else if (plan.mode === "images") {
    for (let index = 0; index < plan.imageUrls.length; index += 1) {
      const imageUrl = plan.imageUrls[index];
      const caption = index === 0 ? plan.caption : "";
      const resultImage = await sendImageMessage({ ...creds, imageUrl, caption });
      sent.push({ type: "image", result: resultImage, mediaUrl: imageUrl, text: caption });
    }
    await sendPlanFollowUps(creds, plan, sent);
  } else if (plan.mode === "text") {
    if (plan.text) {
      const result = await sendTextMessage({ ...creds, text: plan.text });
      sent.push({ type: "text", result, text: plan.text });
    }
    await sendPlanFollowUps(creds, plan, sent);
  }
}

let greetingIndexes;
function ensureGreetingIndexes() {
  greetingIndexes ||= WhatsAppGreetingLog.createIndexes().catch((error) => { greetingIndexes = null; throw error; });
  return greetingIndexes;
}

async function hasGreetingWindow({ conversationId, order, account, customerWaId }) {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  if (order.whatsappVoiceCall && order.whatsappVoiceMessaging && await WhatsAppVoiceCall.exists({
    _id: order.whatsappVoiceCall, phoneNumberId: account.phoneNumberId, phone: customerWaId,
    createdAt: { $gt: cutoff },
  })) return true;
  return Boolean(await WhatsAppMessage.exists({
    conversation: conversationId, direction: "inbound", sender: "customer",
    "meta.rawType": { $nin: ["reaction", "unknown", "unsupported", "system"] },
    "meta.isWelcomeRequest": { $ne: true },
    $or: [
      { "meta.receivedAt": { $gt: cutoff } },
      { "meta.receivedAt": { $exists: false }, createdAt: { $gt: cutoff } },
    ],
  }));
}

const sendsInProgress = new Map();
function sendGreetingForAccount(options = {}) {
  const key = `${options.account?._id}:${options.customerWaId}`;
  if (sendsInProgress.has(key)) return sendsInProgress.get(key);
  const pending = sendGreetingOnce(options).finally(() => sendsInProgress.delete(key));
  sendsInProgress.set(key, pending);
  return pending;
}

async function sendGreetingOnce({ account, customerWaId, order, conversationId, onOutbound } = {}) {
  if (!account?._id || !customerWaId || !order || !conversationId) return { sent: false, reason: "missing_context" };

  const greeting = await WhatsAppGreeting.findOne({
    account: account._id,
    enabled: true,
  }).lean();

  if (!greeting) return { sent: false, reason: "greeting_disabled_or_missing" };

  const steps = normalizeGreetingMessages(greeting);
  if (!steps.length) return { sent: false, reason: "empty_greeting" };

  const previous = await WhatsAppMessage.exists({ conversation: conversationId, direction: "outbound",
    "meta.kind": { $in: ["order_confirmation", "payment_received"] } });
  if (previous) return { sent: false, reason: "returning_customer" };
  const templateOnly = !await hasGreetingWindow({ conversationId, order, account, customerWaId });
  if (templateOnly && (order.whatsappOrderGreetingOptIn !== true || !greeting.orderTemplateName)) {
    return { sent: false, reason: "no_eligible_template" };
  }

  await ensureGreetingIndexes();
  const lookup = { account: account._id, customerWaId };
  const claimId = randomUUID();
  const now = new Date();
  try {
    await WhatsAppGreetingLog.findOneAndUpdate(
      { ...lookup, sentAt: null, $or: [{ claimUntil: null }, { claimUntil: { $lte: now } }] },
      { $set: { claimId, claimUntil: new Date(+now + 5 * 60_000) }, $setOnInsert: lookup },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    // A different web instance can be sending the greeting for the same recipient.
    const waitUntil = Date.now() + 15_000;
    while (Date.now() < waitUntil) {
      const existing = await WhatsAppGreetingLog.findOne(lookup).select("sentAt claimUntil").lean();
      if (existing?.sentAt || !existing?.claimUntil || existing.claimUntil <= new Date()) break;
      await delay(500);
    }
    return { sent: false, reason: "already_claimed" };
  }

  const creds = {
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: customerWaId,
  };

  const allSent = [];
  let sendError;
  try {
    if (templateOnly) {
      const result = await sendTemplateMessage({ ...creds, templateName: greeting.orderTemplateName,
        languageCode: greeting.orderTemplateLanguage || "en" });
      allSent.push({ type: "text", result, text: `Welcome template: ${greeting.orderTemplateName}` });
    } else {
      for (const step of steps) await sendGreetingStep(creds, step, allSent);
    }
  } catch (error) {
    sendError = error;
  } finally {
    const accepted = allSent.some((item) => item.result?.messages?.[0]?.id);
    await WhatsAppGreetingLog.updateOne({ ...lookup, claimId }, {
      ...(accepted && { $set: { sentAt: new Date() } }),
      $unset: { claimId: 1, claimUntil: 1 },
    });
  }
  const accepted = allSent.filter((item) => item.result?.messages?.[0]?.id);
  if (typeof onOutbound === "function") {
    for (const item of accepted) await onOutbound(item);
  }
  if (sendError) throw sendError;
  logger.info("whatsapp.greeting.sent", {
    accountId: String(account._id),
    steps: steps.length,
    messages: accepted.length,
  });
  return { sent: Boolean(accepted.length), steps: steps.length, messages: accepted.length };
}

async function syncConversationalAutomation(account, greeting) {
  if (!account?.phoneNumberId || !account?.accessToken) return null;
  try {
    return await configureConversationalAutomation({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      prompts: greeting?.iceBreakers || [],
    });
  } catch (error) {
    logger.warn("whatsapp.conversational_automation.failed", {
      phoneNumberId: account.phoneNumberId,
      message: error.message,
    });
    throw error;
  }
}

async function handleCopyCodeReply({ account, customerWaId, buttonReplyId }) {
  if (!buttonReplyId?.startsWith("copy:")) return false;
  const code = buttonReplyId.slice(5).trim();
  if (!code) return false;
  await sendTextMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: customerWaId,
    text: formatCopyCodeMessage(code, "Your code"),
  });
  return true;
}

module.exports = {
  sanitizeButtons,
  sanitizeGreetingMessage,
  normalizeGreetingMessages,
  buildInteractiveFromGreeting,
  sendGreetingForAccount,
  syncConversationalAutomation,
  handleCopyCodeReply,
};
