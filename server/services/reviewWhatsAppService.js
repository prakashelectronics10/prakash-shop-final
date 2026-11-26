const crypto = require("node:crypto");
const { Types } = require("mongoose");
const ProductReview = require("../models/ProductReview");
const ReviewWhatsAppSettings = require("../models/ReviewWhatsAppSettings");
const env = require("../config/env");
const { logger } = require("../utils/logger");
const { getActiveWhatsAppAccount, toWhatsAppE164 } = require("./whatsappAccountService");
const whatsapp = require("./whatsappCloudApiService");

const SETTINGS_ID = "product-review-whatsapp";
const PREFIX = "product-review:";
const QUICK_REPLY_ACTIONS = new Map([["approve", "approve"], ["decline", "decline"], ["manage later", "later"]]);
const POLL_MS = 15_000;
const MAX_ATTEMPTS = 5;
let timer;
let running = false;

function alertsAvailable() {
  return Boolean(env.whatsapp.enabled && env.whatsapp.templates.productReviewAlert && env.metaApp.appSecret && env.jwtSecret);
}

async function prepareReviewAlerts() {
  if (!alertsAvailable()) return {};
  const settings = await ReviewWhatsAppSettings.findById(SETTINGS_ID).lean();
  if (!settings?.enabled || !settings.generation || !settings.recipients?.length) return {};
  const nextAttemptAt = new Date();
  return {
    whatsappGeneration: settings.generation,
    whatsappDeliveries: settings.recipients.map(({ _id }) => ({ recipientId: _id, nextAttemptAt })),
  };
}

function compactText(value, limit) {
  const characters = Array.from(String(value || "").replace(/\s+/g, " ").trim());
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

function actionSignature(reviewId, deliveryId, action, recipientWaId, phoneNumberId) {
  return crypto.createHmac("sha256", env.jwtSecret)
    .update(`${PREFIX}${reviewId}:${deliveryId}:${action}:${recipientWaId}:${phoneNumberId}`)
    .digest("hex").slice(0, 32);
}

function templateComponents(review, delivery, whatsappNumber, phoneNumberId) {
  const recipientWaId = toWhatsAppE164(whatsappNumber);
  const text = [`${review.rating}/5`, compactText(review.review, 600) || "Rating only", compactText(review.productName, 100)];
  return [
    { type: "body", parameters: text.map((value) => ({ type: "text", text: value })) },
    ...[...QUICK_REPLY_ACTIONS.values()].map((action, index) => ({
      type: "button", sub_type: "quick_reply", index: String(index),
      parameters: [{ type: "payload", payload: `${PREFIX}${review._id}:${delivery._id}:${action}:${actionSignature(review._id, delivery._id, action, recipientWaId, phoneNumberId)}` }],
    })),
  ];
}

async function deliverNextReviewAlert(now = new Date()) {
  const claim = new Types.ObjectId();
  const leaseUntil = new Date(now.getTime() + Math.max(120_000, env.whatsapp.requestTimeoutMs + 30_000));
  const review = await ProductReview.findOneAndUpdate({
    whatsappDeliveries: { $elemMatch: { nextAttemptAt: { $lte: now } } },
  }, {
    $set: { "whatsappDeliveries.$.claim": claim, "whatsappDeliveries.$.nextAttemptAt": leaseUntil },
    $inc: { "whatsappDeliveries.$.attempts": 1 },
  }, { new: true, timestamps: false });
  if (!review) return false;

  const delivery = review.whatsappDeliveries.find((item) => item.claim?.equals(claim));
  const filter = { _id: review._id, whatsappDeliveries: { $elemMatch: { _id: delivery._id, claim } } };
  const update = { $unset: { "whatsappDeliveries.$.claim": 1, "whatsappDeliveries.$.nextAttemptAt": 1 } };

  try {
    const settings = await ReviewWhatsAppSettings.findById(SETTINGS_ID).lean();
    const recipient = settings?.enabled && settings.generation?.equals(review.whatsappGeneration)
      ? settings.recipients.find((item) => item._id.equals(delivery.recipientId))
      : null;
    if (recipient && delivery.attempts <= MAX_ATTEMPTS) {
      const account = await getActiveWhatsAppAccount();
      if (!account) throw new Error("WhatsApp account is unavailable");
      const result = await whatsapp.sendTemplateMessage({
        phoneNumberId: account.phoneNumberId, accessToken: account.accessToken,
        to: toWhatsAppE164(recipient.whatsappNumber),
        templateName: env.whatsapp.templates.productReviewAlert,
        languageCode: env.whatsapp.templates.productReviewAlertLanguage,
        components: templateComponents(review, delivery, recipient.whatsappNumber, account.phoneNumberId),
      });
      const messageId = result?.messages?.[0]?.id;
      if (!messageId) throw new Error("WhatsApp did not acknowledge the alert");
      update.$set = { "whatsappDeliveries.$.messageId": messageId, "whatsappDeliveries.$.phoneNumberId": account.phoneNumberId };
    }
  } catch (error) {
    const waitingForTemplate = whatsapp.isWhatsAppTemplateTemporarilyUnavailable(error);
    logger.warn("review_whatsapp.delivery_failed", { reviewId: String(review._id), attempt: delivery.attempts, status: error.status, metaCode: error.payload?.error?.code, waitingForTemplate });
    if (waitingForTemplate || delivery.attempts < MAX_ATTEMPTS) {
      delete update.$unset["whatsappDeliveries.$.nextAttemptAt"];
      const delay = (waitingForTemplate ? 5 : delivery.attempts * 5) * 60_000;
      update.$set = { "whatsappDeliveries.$.nextAttemptAt": new Date(Date.now() + delay) };
      if (waitingForTemplate) update.$inc = { "whatsappDeliveries.$.attempts": -1 };
    }
  }
  await ProductReview.updateOne(filter, update, { timestamps: false });
  return true;
}

function isSignedReviewAction(id) {
  return typeof id === "string" && id.startsWith(PREFIX);
}

function getContextReviewAction(event) {
  const messageId = event.raw?.context?.id;
  if (event.type === "button" && typeof messageId === "string" && messageId) {
    return QUICK_REPLY_ACTIONS.get(event.text?.toLowerCase());
  }
  return undefined;
}

async function handleReviewAction({ account, event }) {
  if (!env.metaApp.appSecret || !env.jwtSecret || !["button", "interactive"].includes(event.type)) return;
  const phoneNumberId = String(account.phoneNumberId);
  const sender = toWhatsAppE164(event.customerWaId);
  if (!sender) return;

  let review;
  let delivery;
  let action;
  if (isSignedReviewAction(event.buttonReplyId)) {
    const match = /^product-review:([a-f\d]{24}):([a-f\d]{24}):(approve|decline|later):([a-f\d]{32})$/.exec(event.buttonReplyId);
    if (!match) return;
    const [, reviewId, deliveryId, signedAction, signature] = match;
    const expected = actionSignature(reviewId, deliveryId, signedAction, sender, phoneNumberId);
    if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return;

    // The signed payload binds the action to this delivery, sender, and business number.
    // A reply can arrive before the outbound message ID is saved, or refer to an earlier delivery retry.
    review = await ProductReview.findById(reviewId).select("whatsappDeliveries").lean();
    delivery = review?.whatsappDeliveries?.find((item) => String(item._id) === deliveryId);
    action = signedAction;
  } else {
    action = getContextReviewAction(event);
    if (!action) return;
    const messageId = event.raw.context.id;
    // Template quick replies without a custom payload must match the original outbound alert.
    review = await ProductReview.findOne({ whatsappDeliveries: { $elemMatch: { messageId, phoneNumberId } } })
      .select("whatsappDeliveries").lean();
    delivery = review?.whatsappDeliveries?.find((item) => item.messageId === messageId && item.phoneNumberId === phoneNumberId);
  }
  if (!delivery) return;

  const settings = await ReviewWhatsAppSettings.findById(SETTINGS_ID).lean();
  const recipient = settings?.recipients?.find((item) => item._id.equals(delivery.recipientId)
    && toWhatsAppE164(item.whatsappNumber) === sender);
  if (!recipient) return;

  let text;
  if (action === "later") {
    const url = new URL("/prakash-control-panel@1999/productReviews", env.frontendUrl);
    text = `You can manage this review in the admin panel: ${url.href}`;
  } else {
    const status = action === "approve" ? "approved" : "declined";
    const now = new Date();
    const update = await ProductReview.updateOne({ _id: review._id, status: "pending" }, {
      $set: { status, readAt: now, moderatedAt: now, moderatedByWhatsAppRecipient: recipient._id },
      $unset: { moderatedBy: 1 },
    });
    if (update.modifiedCount) {
      text = status === "approved" ? "Review approved and published on the product page." : "Review declined.";
    } else {
      const current = await ProductReview.findById(review._id).select("status").lean();
      text = current ? `This review is already ${current.status}.` : "This review is no longer available.";
    }
  }
  return { phoneNumberId, accessToken: account.accessToken, to: sender, text };
}

async function wakeReviewAlerts() {
  if (!timer || running) return;
  running = true;
  try {
    for (let count = 0; count < 15; count += 1) {
      if (!(await deliverNextReviewAlert())) break;
    }
  } catch (error) {
    logger.error("review_whatsapp.worker_failed", { code: error.code });
  } finally {
    running = false;
  }
}

function startReviewWhatsAppWorker() {
  if (timer || !alertsAvailable()) return;
  timer = setInterval(wakeReviewAlerts, POLL_MS);
  timer.unref();
  void wakeReviewAlerts();
}

module.exports = {
  SETTINGS_ID, alertsAvailable, prepareReviewAlerts, isSignedReviewAction, getContextReviewAction, handleReviewAction,
  startReviewWhatsAppWorker, wakeReviewAlerts, templateComponents, deliverNextReviewAlert,
};
