const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "unit-test-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "unit-webhook-secret";

const Order = require("../models/Order");
const { verifyPaymentSignature, verifyWebhookSignature } = require("../services/razorpayService");

test("verifies Razorpay signatures with a timing-safe HMAC comparison", () => {
  const razorpayOrderId = "order_unit_123";
  const razorpayPaymentId = "pay_unit_456";
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  assert.equal(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }), true);
  assert.equal(verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature: "invalid" }), false);
});

test("verifies Razorpay webhook signatures against the raw payload", () => {
  const payload = Buffer.from(JSON.stringify({ event: "payment.captured" }));
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest("hex");
  assert.equal(verifyWebhookSignature(payload, signature), true);
  assert.equal(verifyWebhookSignature(payload, "invalid"), false);
});

test("order schema rejects non-six-digit pincodes", () => {
  const order = new Order({
    orderId: "PE-20260907-UNITTEST0001",
    customer: { name: "Test", phone: "9876543210", address: "Test address", pincode: "12345" },
    items: [{
      sourceType: "shop-product",
      productId: "66b000000000000000000001",
      productName: "Test product",
      unitPrice: 500,
      quantity: 1,
      lineTotal: 500,
    }],
    itemCount: 1,
    subtotal: 500,
    total: 500,
    razorpayOrderId: "order_unit_123",
  });

  assert.match(order.validateSync().errors["customer.pincode"].message, /invalid/i);
});
