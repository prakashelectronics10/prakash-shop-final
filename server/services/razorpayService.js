const crypto = require("crypto");
const env = require("../config/env");
const AppError = require("../utils/AppError");

function ensureConfigured() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new AppError("Online payment is temporarily unavailable. Please contact the shop.", 503);
  }
}

async function razorpayRequest(path, options = {}) {
  ensureConfigured();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.description || "Payment provider request failed";
    throw new AppError(message, response.status >= 500 ? 502 : 400);
  }
  return payload;
}

function createRazorpayOrder({ amount, receipt, notes }) {
  return razorpayRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt,
      notes,
      payment_capture: 1,
    }),
  });
}

function getRazorpayPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

function getRazorpayOrderPayments(orderId) {
  return razorpayRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
}

function createPaymentLink({ amount, referenceId, customer }) {
  return razorpayRequest("/payment_links", {
    method: "POST",
    body: JSON.stringify({
      amount, currency: "INR", accept_partial: false, reference_id: referenceId,
      description: `Prakash Electronics order ${referenceId}`,
      customer: { name: customer.name, contact: `+91${customer.phone}` },
      notify: { sms: false, email: false }, reminder_enable: false,
      expire_by: Math.floor(Date.now() / 1000) + 86400,
      notes: { internalOrderId: referenceId, channel: "whatsapp" },
    }),
  });
}

function findPaymentLinks(referenceId) {
  return razorpayRequest(`/payment_links?reference_id=${encodeURIComponent(referenceId)}`);
}

function getPaymentLink(id) {
  return razorpayRequest(`/payment_links/${encodeURIComponent(id)}`);
}

function cancelPaymentLink(id) {
  return razorpayRequest(`/payment_links/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  ensureConfigured();
  const expected = crypto
    .createHmac("sha256", env.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  const supplied = String(signature || "");
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) throw new AppError("Payment webhook is not configured", 503);
  const expected = crypto.createHmac("sha256", env.razorpay.webhookSecret).update(rawBody).digest("hex");
  const supplied = String(signature || "");
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

module.exports = {
  createPaymentLink,
  findPaymentLinks,
  getPaymentLink,
  cancelPaymentLink,
  createRazorpayOrder,
  getRazorpayPayment,
  getRazorpayOrderPayments,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
