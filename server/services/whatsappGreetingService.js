const env = require("../config/env");
const WhatsAppGreeting = require("../models/WhatsAppGreeting");
const WhatsAppGreetingLog = require("../models/WhatsAppGreetingLog");
const {
  sendTextMessage,
  sendImageMessage,
  sendInteractiveMessage,
} = require("./whatsappCloudApiService");
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

function buildInteractiveFromGreeting(greeting) {
  const bodyText = String(greeting.bodyText || "").trim().slice(0, 1024);
  const footerText = String(greeting.footerText || "").trim().slice(0, 60);
  const imageUrl = String(greeting.imageUrl || "").trim();
  const buttons = sanitizeButtons(greeting.buttons);

  const header = imageUrl
    ? { type: "image", image: { link: imageUrl } }
    : undefined;

  const urlButtons = buttons.filter((button) => button.type === "url" && button.url);
  const replyButtons = buttons.filter((button) => button.type === "copy_code" || button.type === "quick_reply");

  // WhatsApp allows either one cta_url OR up to 3 reply buttons — not mixed.
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
          parameters: {
            display_text: button.label,
            url: button.url,
          },
        },
      },
    };
  }

  if (replyButtons.length) {
    const actionButtons = replyButtons.slice(0, 3).map((button) => {
      const replyId = button.type === "copy_code"
        ? `copy:${button.code || button.id}`
        : (button.payload || button.id);
      return {
        type: "reply",
        reply: {
          id: String(replyId).slice(0, 256),
          title: button.label,
        },
      };
    });

    return {
      mode: "interactive",
      interactive: {
        type: "button",
        ...(header ? { header } : {}),
        body: { text: bodyText || "Welcome!" },
        ...(footerText ? { footer: { text: footerText } } : {}),
        action: { buttons: actionButtons },
      },
      // Extra URL buttons cannot share the same interactive payload — send as follow-up text.
      followUpUrls: urlButtons,
    };
  }

  if (imageUrl && bodyText) {
    return { mode: "image", imageUrl, caption: bodyText };
  }
  if (imageUrl) {
    return { mode: "image", imageUrl, caption: "" };
  }
  if (bodyText) {
    return { mode: "text", text: bodyText };
  }
  return null;
}

async function shouldSendGreeting(accountId, customerWaId) {
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

async function sendGreetingForAccount({ account, customerWaId }) {
  if (!account?._id || !customerWaId) return { sent: false, reason: "missing_context" };

  const greeting = await WhatsAppGreeting.findOne({
    account: account._id,
    enabled: true,
  }).lean();

  if (!greeting) return { sent: false, reason: "greeting_disabled_or_missing" };

  const allowed = await shouldSendGreeting(account._id, customerWaId);
  if (!allowed) return { sent: false, reason: "cooldown" };

  const plan = buildInteractiveFromGreeting(greeting);
  if (!plan) return { sent: false, reason: "empty_greeting" };

  const creds = {
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: customerWaId,
  };

  if (plan.mode === "interactive") {
    await sendInteractiveMessage({ ...creds, interactive: plan.interactive });
    for (const button of plan.followUpUrls || []) {
      await sendTextMessage({
        ...creds,
        text: `${button.label}: ${button.url}`,
      });
    }
  } else if (plan.mode === "image") {
    await sendImageMessage({ ...creds, imageUrl: plan.imageUrl, caption: plan.caption });
  } else if (plan.mode === "text") {
    await sendTextMessage({ ...creds, text: plan.text });
  }

  await markGreetingSent(account._id, customerWaId);
  logger.info("whatsapp.greeting.sent", {
    accountId: String(account._id),
    customerWaId,
    mode: plan.mode,
  });
  return { sent: true, mode: plan.mode };
}

async function handleCopyCodeReply({ account, customerWaId, buttonReplyId }) {
  if (!buttonReplyId?.startsWith("copy:")) return false;
  const code = buttonReplyId.slice(5).trim();
  if (!code) return false;
  await sendTextMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: customerWaId,
    text: `Your code: ${code}`,
  });
  return true;
}

module.exports = {
  sanitizeButtons,
  buildInteractiveFromGreeting,
  sendGreetingForAccount,
  handleCopyCodeReply,
};
