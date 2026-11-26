import { apiRequest } from "../api/client";

const RECOVERY_KEY = "prakash:checkout-payment";
export const PAYMENT_RECOVERY_URL = "/checkout?payment=resume";
let checkoutScript;

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScript) {
    checkoutScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => window.Razorpay ? resolve() : reject(new Error("Secure payment window could not be loaded"));
      script.onerror = () => {
        script.remove();
        reject(new Error("Secure payment window could not be loaded"));
      };
      document.body.appendChild(script);
    }).catch((error) => {
      checkoutScript = null;
      throw error;
    });
  }
  return checkoutScript;
}

export function savePaymentRecovery(payment, options = {}) {
  const recovery = {
    orderId: payment.orderId, razorpayOrderId: payment.razorpayOrderId, keyId: payment.keyId,
    amount: payment.amount, currency: payment.currency, ...options,
  };
  try { window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(recovery)); } catch (_error) { /* Live verification still works. */ }
  return recovery;
}

export function readPaymentRecovery() {
  if (new URLSearchParams(window.location.search).get("payment") !== "resume") return null;
  try {
    const recovery = JSON.parse(window.sessionStorage.getItem(RECOVERY_KEY));
    return recovery?.orderId && recovery?.razorpayOrderId ? recovery : null;
  } catch (_error) {
    return null;
  }
}

function paymentRequest(path, payment, fields = {}) {
  return apiRequest(`/orders/payment/${path}`, {
    method: "POST",
    timeout: 26000,
    cache: "no-store",
    body: JSON.stringify({ orderId: payment.orderId, razorpayOrderId: payment.razorpayOrderId, ...fields }),
  }).then((response) => response.data);
}

export const getPaymentStatus = (payment, resume = false) => paymentRequest("status", payment, { resume });
export const reportFailedPayment = (payment) => paymentRequest("failed", payment);
export function verifyCheckoutPayment(payment, response) {
  return paymentRequest("verify", payment, {
    razorpayPaymentId: response.razorpay_payment_id,
    razorpaySignature: response.razorpay_signature,
  });
}

export function openRazorpayCheckout(payment, { onCaptured, onDismiss, onFailed }) {
  const razorpay = new window.Razorpay({
    key: payment.keyId,
    amount: payment.amount,
    currency: payment.currency,
    name: "Prakash Electronics",
    description: `Order ${payment.orderId}`,
    image: `${window.location.origin}/logo192.png`,
    order_id: payment.razorpayOrderId,
    prefill: { name: payment.customer?.name, contact: payment.customer?.phone },
    notes: { orderId: payment.orderId },
    theme: { color: "#2563eb", backdrop_color: "rgba(15, 23, 42, 0.58)" },
    modal: { ondismiss: onDismiss, escape: true, confirm_close: true },
    handler: onCaptured,
  });
  razorpay.on("payment.failed", onFailed);
  razorpay.open();
}
