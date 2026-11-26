const assert = require("node:assert/strict");
const test = require("node:test");
const Order = require("../models/Order");
const Invoice = require("../models/Invoice");
const Otp = require("../models/CustomerWhatsAppOtp");
const razorpay = require("../services/razorpayService");

function run(handler, body, params = {}) {
  return new Promise((resolve, reject) => handler({ body, params }, { set() {}, json: resolve }, reject));
}

test("captured payments recover from the provider; authorization, mismatches and invalid callbacks do not mark orders paid or failed", async (t) => {
  const payment = { id: "pay_evidence", order_id: "order_evidence", status: "authorized", amount: 24900, currency: "INR" };
  const order = {
    _id: "internal-order", orderId: "PEORDER", razorpayOrderId: payment.order_id, paymentStatus: "pending",
    orderStatus: "awaiting_payment", total: 249, items: [], customer: {},
  };
  const notifications = [];
  t.mock.method(require("../services/orderNotificationService"), "enqueueOrderPaidNotification", (entry) => notifications.push(entry));
  t.mock.method(require("../services/orderInvoiceService"), "createOrderInvoice", async () => null);
  t.mock.method(razorpay, "getRazorpayOrderPayments", async () => ({ items: [payment] }));
  t.mock.method(razorpay, "verifyPaymentSignature", () => false);
  t.mock.method(Otp, "findOne", () => ({ select: () => ({ lean: async () => ({ whatsappNumber: "9000000001" }) }) }));
  t.mock.method(Order, "findOne", async (filter) => {
    assert.equal(filter.orderId, order.orderId);
    if (filter["customer.whatsappNumber"]) {
      assert.ok(filter["customer.whatsappNumber"].$in.includes("9000000001"));
      return { ...order };
    }
    return filter.razorpayOrderId === order.razorpayOrderId ? { ...order } : null;
  });
  const update = t.mock.method(Order, "findOneAndUpdate", async (filter, action) => {
    assert.deepEqual(filter.paymentStatus.$in, ["pending", "failed"]);
    assert.equal(filter.orderStatus, "awaiting_payment");
    assert.equal(filter.razorpayOrderId, order.razorpayOrderId);
    if (order.paymentStatus !== "pending") return null;
    Object.assign(order, action.$set);
    return { ...order };
  });
  t.mock.method(Order, "findById", async () => ({ ...order }));
  const controller = require("../controllers/orderController");
  const credentials = { orderId: order.orderId, razorpayOrderId: order.razorpayOrderId };

  await assert.rejects(run(controller.getCheckoutPaymentStatus, { ...credentials, razorpayOrderId: "order_other" }), { statusCode: 404 });
  await assert.rejects(run(controller.verifyPayment, credentials), { statusCode: 400 });
  assert.equal((await run(controller.markPaymentFailed, credentials)).data.processing, true);
  const retry = await run(controller.retryCustomerOrderPayment, {
    challengeId: "1".repeat(24), verifiedToken: "T".repeat(43),
  }, { orderId: order.orderId });
  assert.equal(retry.data.processing, true);
  assert.equal(retry.data.razorpayOrderId, undefined);
  payment.status = "captured";
  payment.amount = 24800;
  const mismatch = (await run(controller.getCheckoutPaymentStatus, credentials)).data;
  assert.equal(mismatch.paymentStatus, "pending");
  assert.equal(mismatch.processing, true);
  assert.equal(update.mock.callCount(), 0);

  payment.amount = 24900;
  const results = await Promise.all([
    run(controller.getCheckoutPaymentStatus, credentials),
    run(controller.getCheckoutPaymentStatus, credentials),
  ]);
  assert.ok(results.every(({ data }) => data.order.paymentStatus === "paid"));
  assert.equal(notifications.length, 1);
  assert.ok(order.invoiceWhatsAppNextAttemptAt instanceof Date);
  assert.equal((await run(controller.markPaymentFailed, credentials)).data.paymentStatus, "paid");
});

test("history uses a dedicated verified, unexpired OTP and looks up only its WhatsApp number, including unpaid orders", async (t) => {
  const credentials = { challengeId: "1".repeat(24), verifiedToken: "T".repeat(43), whatsappNumber: "6999999999" };
  let valid = false;
  t.mock.method(Otp, "findOne", (filter) => {
    assert.equal(filter.purpose, "order-history");
    assert.equal(filter.verifiedTokenHash, Otp.hashToken(credentials.verifiedToken));
    assert.ok(filter.expiresAt.$gt instanceof Date);
    return { select: () => ({ lean: async () => valid ? { whatsappNumber: "9000000001" } : null }) };
  });
  const placedAt = new Date("2026-11-24T12:00:00Z");
  const orders = [
    { orderId: "PEPAID", paymentStatus: "paid", orderStatus: "confirmed", customer: {}, items: [], createdAt: placedAt },
    { orderId: "PEFAILED", paymentStatus: "failed", orderStatus: "awaiting_payment", customer: {}, items: [], createdAt: placedAt },
  ];
  const find = t.mock.method(Order, "find", (filter) => {
    assert.deepEqual(filter, { "customer.whatsappNumber": { $in: ["9000000001", "919000000001", "+919000000001"] } });
    return { sort: () => ({ limit: () => ({ lean: async () => orders }) }) };
  });
  t.mock.method(Invoice, "find", () => ({ select: () => ({ lean: async () => [{ orderId: "PEPAID", invoiceNumber: "INV-1" }] }) }));
  t.mock.method(Order, "findOne", async (filter) => {
    assert.equal(filter.orderId, "PEOTHER");
    assert.deepEqual(filter["customer.whatsappNumber"], { $in: ["9000000001", "919000000001", "+919000000001"] });
    return null;
  });
  const { getCustomerOrders, retryCustomerOrderPayment } = require("../controllers/orderController");
  await assert.rejects(run(getCustomerOrders, credentials), { statusCode: 401 });
  assert.equal(find.mock.callCount(), 0);
  valid = true;
  await assert.rejects(run(retryCustomerOrderPayment, credentials, { orderId: "PEOTHER" }), { statusCode: 404 });
  const { data } = await run(getCustomerOrders, credentials);
  assert.deepEqual(data.orders.map(({ orderId, canPay, invoiceNumber }) => ({ orderId, canPay, invoiceNumber })), [
    { orderId: "PEPAID", canPay: false, invoiceNumber: "INV-1" },
    { orderId: "PEFAILED", canPay: true, invoiceNumber: "" },
  ]);
});

test("WhatsApp View orders opens the public Track Order URL without credentials", async (t) => {
  const env = require("../config/env");
  const originalEnabled = env.whatsapp.enabled;
  const originalSecret = env.metaApp.appSecret;
  t.after(() => {
    env.whatsapp.enabled = originalEnabled;
    env.metaApp.appSecret = originalSecret;
  });
  env.whatsapp.enabled = true;
  env.metaApp.appSecret = "";
  t.mock.method(require("../models/WhatsAppAccount"), "findOne", async () => ({
    _id: "account", phoneNumberId: "shop-phone", accessToken: "test-token",
  }));
  t.mock.method(require("../services/whatsappConversationService"), "recordMessage",
    async () => ({ conversation: { _id: "conversation" } }));
  const send = t.mock.method(require("../services/whatsappCloudApiService"), "sendInteractiveMessage",
    async () => ({ messages: [{ id: "sent-message" }] }));
  const createOtp = t.mock.method(Otp, "create", async () => { throw new Error("Unexpected OTP creation"); });
  const { handleWhatsAppWebhook } = require("../controllers/whatsappWebhookController");
  const body = { entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "shop-phone" },
    messages: [{ id: "incoming", from: "919000000001", type: "text", text: { body: "View all orders" } }],
  } }] }] };
  await new Promise((resolve, reject) =>
    handleWhatsAppWebhook({ body }, { status: () => ({ json: resolve }) }, reject));
  // The webhook acknowledges before it finishes sending the WhatsApp reply.
  await new Promise(setImmediate);
  assert.equal(send.mock.callCount(), 1);
  const { to, interactive } = send.mock.calls[0].arguments[0];
  assert.equal(to, "919000000001");
  assert.equal(interactive.type, "cta_url");
  assert.deepEqual(interactive.action.parameters, {
    display_text: "View orders", url: new URL("/orders", env.productionUrl).href,
  });
  assert.equal(createOtp.mock.callCount(), 0);
});
