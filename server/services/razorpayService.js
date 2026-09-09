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

function refundRazorpayPayment(paymentId, { amount, receipt, notes } = {}) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: JSON.stringify({
      ...(Number.isFinite(amount) ? { amount } : {}),
      speed: "normal",
      ...(receipt ? { receipt } : {}),
      ...(notes ? { notes } : {}),
    }),
  });
}

function getRazorpayPaymentRefunds(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/refunds`);
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
  createRazorpayOrder,
  getRazorpayPayment,
  refundRazorpayPayment,
  getRazorpayPaymentRefunds,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
