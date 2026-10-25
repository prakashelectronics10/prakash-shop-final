const env = require("../config/env");
const WhatsAppGreeting = require("../models/WhatsAppGreeting");
const WhatsAppGreetingLog = require("../models/WhatsAppGreetingLog");
const {
  sendTextMessage,
  sendImageMessage,
  sendInteractiveMessage,
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
      .filter((item) => item.bodyText || item.imageUrls.length || item.buttons.length);
  }

  // Legacy single-message shape → one sequence step
  const legacy = sanitizeGreetingMessage({
    id: "legacy_1",
    type: greeting?.buttons?.length ? "interactive" : (greeting?.imageUrl ? "image" : "text"),
    bodyText: greeting?.bodyText,
    footerText: greeting?.footerText,
    imageUrl: greeting?.imageUrl,
    imagePublicId: greeting?.imagePublicId,
    imageSourceUrl: greeting?.imageSourceUrl,
    buttons: greeting?.buttons,
  }, 0);

  return (legacy.bodyText || legacy.imageUrls.length || legacy.buttons.length) ? [legacy] : [];
}

function buildInteractivePlan(step) {
  const bodyText = markdownToWhatsApp(step.bodyText);
  const footerText = step.footerText;
  const imageUrl = step.imageUrls[0] || "";
  const buttons = step.buttons;
  const header = imageUrl ? { type: "image", image: { link: imageUrl } } : undefined;
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
      extraImages: step.imageUrls.slice(1),
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
      extraImages: step.imageUrls.slice(header ? 1 : 0),
      copyFollowUps,
    };
  }

  if (step.imageUrls.length) {
    return {
      mode: "images",
      imageUrls: step.imageUrls,
      caption: bodyText,
      copyFollowUps,
      followUpUrls: urlButtons,
    };
  }

  if (bodyText || copyFollowUps.length || urlButtons.length) {
    return {
      mode: "text",
      text: bodyText,
      copyFollowUps,
      followUpUrls: urlButtons,
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

async function shouldSendGreeting(accountId, customerWaId, { force = false } = {}) {
  if (force) return true;
  const cooldownHours = Math.max(1, Number(env.whatsapp.greetingCooldownHours || 24));
  const existing = await WhatsAppGreetingLog.findOne({
    account: accountId,
    customerWaId,
  }).lean();

  if (!existing) return true;
  const ageMs = Date.now() - new Date(existing.sentAt).getTime();
  return ageMs >= cooldownHours * 60 * 60 * 1000;
}

async function markGreetingSent(accountId, customerWaId) {
  await WhatsAppGreetingLog.findOneAndUpdate(
    { account: accountId, customerWaId },
    { $set: { sentAt: new Date() } },
    { upsert: true, new: true },
  );
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

async function sendGreetingStep(creds, step) {
  const plan = buildInteractivePlan(step);
  if (!plan) return [];

  const sent = [];

  if (plan.mode === "interactive") {
    const result = await sendInteractiveMessage({ ...creds, interactive: plan.interactive });
    sent.push({ type: "interactive", result, text: step.bodyText, buttons: step.buttons });
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

  return sent;
}

async function sendGreetingForAccount({ account, customerWaId, force = false, onOutbound } = {}) {
  if (!account?._id || !customerWaId) return { sent: false, reason: "missing_context" };

  const greeting = await WhatsAppGreeting.findOne({
    account: account._id,
    enabled: true,
  }).lean();

  if (!greeting) return { sent: false, reason: "greeting_disabled_or_missing" };

  const allowed = await shouldSendGreeting(account._id, customerWaId, { force });
  if (!allowed) return { sent: false, reason: "cooldown" };

  const steps = normalizeGreetingMessages(greeting);
  if (!steps.length) return { sent: false, reason: "empty_greeting" };

  const creds = {
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: customerWaId,
  };

  const allSent = [];
  for (const step of steps) {
    const sent = await sendGreetingStep(creds, step);
    allSent.push(...sent);
    if (typeof onOutbound === "function") {
      for (const item of sent) {
        await onOutbound(item);
      }
    }
  }

  await markGreetingSent(account._id, customerWaId);
  logger.info("whatsapp.greeting.sent", {
    accountId: String(account._id),
    customerWaId,
    steps: steps.length,
    messages: allSent.length,
  });
  return { sent: true, steps: steps.length, messages: allSent.length };
}

async function syncConversationalAutomation(account, greeting) {
  if (!account?.phoneNumberId || !account?.accessToken) return null;
  try {
    return await configureConversationalAutomation({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      enableWelcomeMessage: greeting?.enableWelcomeMessage !== false && greeting?.enabled !== false,
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
