const crypto = require("node:crypto");
const { Types } = require("mongoose");
const ProductReview = require("../models/ProductReview");
const ReviewWhatsAppSettings = require("../models/ReviewWhatsAppSettings");
const env = require("../config/env");
const { logger } = require("../utils/logger");
const { getActiveWhatsAppAccount, toWhatsAppE164 } = require("./whatsappAccountService");
const whatsapp = require("./whatsappCloudApiService");

const SETTINGS_ID = "product-review-whatsapp";
const ACTIONS = ["approve", "decline", "later"];
const PREFIX = "product-review:";
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
    ...ACTIONS.map((action, index) => ({
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

function isReviewAction(id) {
  return typeof id === "string" && id.startsWith(PREFIX);
}

async function handleReviewAction({ account, event }) {
  if (!env.metaApp.appSecret || !env.jwtSecret || !["button", "interactive"].includes(event.type)) return;
  const match = /^product-review:([a-f\d]{24}):([a-f\d]{24}):(approve|decline|later):([a-f\d]{32})$/.exec(event.buttonReplyId);
  if (!match) return;
  const [, reviewId, deliveryId, action, signature] = match;
  const phoneNumberId = account.phoneNumberId;
  const expected = actionSignature(reviewId, deliveryId, action, event.customerWaId, phoneNumberId);
  if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return;

  const review = await ProductReview.findById(reviewId).select("whatsappDeliveries").lean();
  const delivery = review?.whatsappDeliveries?.find((item) => String(item._id) === deliveryId);
  if (!delivery?.messageId || delivery.phoneNumberId !== phoneNumberId
      || (event.raw?.context?.id && event.raw.context.id !== delivery.messageId)) return;
  const settings = await ReviewWhatsAppSettings.findById(SETTINGS_ID).lean();
  const recipient = settings?.recipients?.find((item) => item._id.equals(delivery.recipientId)
    && toWhatsAppE164(item.whatsappNumber) === event.customerWaId);
  if (!recipient) return;

  let text;
  if (action === "later") {
    const url = new URL("/prakash-control-panel@1999/productReviews", env.frontendUrl);
    text = `You can manage this review in the admin panel: ${url.href}`;
  } else {
    const status = action === "approve" ? "approved" : "declined";
    const now = new Date();
    const update = await ProductReview.updateOne({ _id: reviewId, status: "pending" }, {
      $set: { status, readAt: now, moderatedAt: now, moderatedByWhatsAppRecipient: recipient._id },
      $unset: { moderatedBy: 1 },
    });
    text = update.modifiedCount ? `Review ${status}.` : "This review has already been moderated.";
  }
  await whatsapp.sendTextMessage({ phoneNumberId, accessToken: account.accessToken, to: event.customerWaId, text });
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
  SETTINGS_ID, alertsAvailable, prepareReviewAlerts, isReviewAction, handleReviewAction,
  startReviewWhatsAppWorker, wakeReviewAlerts, templateComponents, deliverNextReviewAlert,
};
