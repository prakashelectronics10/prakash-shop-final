const assert = require("node:assert/strict");
const test = require("node:test");
const Order = require("../models/Order");
const ProductReview = require("../models/ProductReview");

test("a paid invoice waits for template approval and is sent once across concurrent workers", async (t) => {
  const initialTime = new Date();
  const order = {
    _id: "invoice-order",
    orderId: "PE-TEST",
    paymentStatus: "paid",
    invoiceWhatsAppNextAttemptAt: initialTime,
  };
  const invoice = { _id: "invoice-test" };
  t.mock.method(require("../services/orderInvoiceService"), "createOrderInvoice", async () => invoice);
  let approved = false;
  const send = t.mock.method(require("../services/whatsappTransactionalService"), "sendOrderInvoiceWhatsApp", async (args) => {
    assert.equal(args.invoice, invoice);
    return approved ? { ok: true, messageId: "wamid.receipt" } : {
      ok: false, reason: "template_unavailable", templateStatus: "PENDING",
    };
  });
  t.mock.method(Order, "findOneAndUpdate", async (filter, update) => {
    const now = filter.invoiceWhatsAppNextAttemptAt.$lte;
    assert.equal(filter.paymentStatus, "paid");
    assert.equal(filter.invoiceWhatsAppSentAt, null);
    assert.deepEqual(filter.$or, [
      { invoiceWhatsAppClaimUntil: null },
      { invoiceWhatsAppClaimUntil: { $lte: now } },
    ]);
    if (!order.invoiceWhatsAppNextAttemptAt || order.invoiceWhatsAppNextAttemptAt > now
      || order.invoiceWhatsAppSentAt || order.invoiceWhatsAppClaimUntil > now) return null;
    Object.assign(order, update.$set);
    return { ...order };
  });
  t.mock.method(Order, "updateOne", async (filter, update) => {
    assert.equal(filter._id, order._id);
    assert.equal(filter.invoiceWhatsAppClaimUntil, order.invoiceWhatsAppClaimUntil);
    Object.assign(order, update.$set);
    Object.keys(update.$unset).forEach((key) => { delete order[key]; });
  });

  const { deliverNextOrderInvoice } = require("../services/orderInvoiceWhatsAppWorker");
  assert.equal(await deliverNextOrderInvoice(initialTime), true);
  assert.equal(order.invoiceWhatsAppSentAt, undefined);
  assert.equal(order.invoiceWhatsAppClaimUntil, undefined);
  assert.ok(order.invoiceWhatsAppNextAttemptAt >= new Date(initialTime.getTime() + 5 * 60 * 1000));
  assert.equal(await deliverNextOrderInvoice(initialTime), false);

  approved = true;
  const nextAttempt = order.invoiceWhatsAppNextAttemptAt;
  assert.deepEqual(await Promise.all([
    deliverNextOrderInvoice(nextAttempt),
    deliverNextOrderInvoice(nextAttempt),
  ]), [true, false]);
  assert.equal(order.invoiceWhatsAppMessageId, "wamid.receipt");
  assert.ok(order.invoiceWhatsAppSentAt instanceof Date);
  assert.equal(order.invoiceWhatsAppNextAttemptAt, undefined);
  assert.equal(await deliverNextOrderInvoice(nextAttempt), false);
  assert.equal(send.mock.callCount(), 2);
});

test("a verified paid order card status is claimed and delivered once", async (t) => {
  const { deliverNextOrderCardStatus } = require("../services/orderInvoiceWhatsAppWorker");
  const order = { _id: "status-order", orderId: "PE-CARD-TEST", customer: { whatsappNumber: "9000000001" },
    whatsappAccount: "account", orderStatus: "confirmed" };
  const env = require("../config/env");
  const enabled = env.whatsapp.enabled;
  env.whatsapp.enabled = true;
  t.after(() => { env.whatsapp.enabled = enabled; });
  t.mock.method(require("../models/WhatsAppAccount"), "findOne", async () => ({
    phoneNumberId: "phone-id", accessToken: "test",
  }));
  const sent = t.mock.method(global, "fetch", async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.to, "919000000001");
    assert.equal(payload.interactive.type, "order_status");
    assert.deepEqual(payload.interactive.action.parameters, {
      reference_id: order.orderId, order: { status: "processing", description: "Payment received." },
    });
    return Response.json({ messages: [{ id: "wamid.status" }] });
  });
  t.mock.method(Order, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.paymentStatus, "paid");
    assert.equal(filter.whatsappCardStatusSentAt, null);
    if (order.whatsappCardStatusNextAttemptAt || order.whatsappCardStatusSentAt) return null;
    return Object.assign(order, update.$set);
  });
  t.mock.method(Order, "updateOne", async (filter, update) => {
    assert.equal(filter.whatsappCardStatusNextAttemptAt, order.whatsappCardStatusNextAttemptAt);
    Object.assign(order, update.$set);
    delete order.whatsappCardStatusNextAttemptAt;
  });
  assert.deepEqual(await Promise.all([deliverNextOrderCardStatus(), deliverNextOrderCardStatus()]), [true, false]);
  assert.ok(order.whatsappCardStatusSentAt);
  assert.equal(sent.mock.callCount(), 1);
});

test("customer review reminders claim one product at a time and skip submitted reviews", async (t) => {
  const { deliverNextCustomerReview } = require("../services/orderInvoiceWhatsAppWorker");
  const now = new Date();
  const products = ["product-one", "already-reviewed", "product-three"].map((productId) => ({ productId, sourceType: "shop-product" }));
  const order = { _id: "review-order", customerReviewQueue: [...products], customerReviewNextAttemptAt: now };
  t.mock.method(Order, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.orderStatus, "delivered");
    if (!order.customerReviewQueue.length || order.customerReviewNextAttemptAt > filter.customerReviewNextAttemptAt.$lte) return null;
    Object.assign(order, update.$set);
    order.customerReviewAttempts = (order.customerReviewAttempts || 0) + 1;
    return { ...order, customerReviewQueue: [...order.customerReviewQueue] };
  });
  t.mock.method(Order, "updateOne", async (filter, update) => {
    assert.equal(filter.customerReviewNextAttemptAt, order.customerReviewNextAttemptAt);
    if (update.$pop) order.customerReviewQueue.shift();
    Object.assign(order, update.$set);
    if (update.$inc) order.customerReviewAttempts += update.$inc.customerReviewAttempts;
    for (const key of Object.keys(update.$unset || {})) delete order[key];
  });
  t.mock.method(ProductReview, "exists", async (filter) => filter.productId === "already-reviewed");
  let approved = false;
  const send = t.mock.method(require("../services/whatsappTransactionalService"), "sendCustomerProductReviewWhatsApp", async () => {
    if (!approved) throw Object.assign(new Error("Template not approved"), { payload: { error: { code: 132001 } } });
    return { ok: true };
  });
  assert.equal(await deliverNextCustomerReview(now), true);
  assert.equal(order.customerReviewAttempts, 0);
  assert.deepEqual(order.customerReviewQueue, products);
  const retry = order.customerReviewNextAttemptAt;
  assert.ok(retry > now);
  assert.equal(await deliverNextCustomerReview(now), false);
  approved = true;
  assert.deepEqual(await Promise.all([deliverNextCustomerReview(retry), deliverNextCustomerReview(retry)]), [true, false]);
  assert.equal(await deliverNextCustomerReview(retry), true);
  assert.equal(await deliverNextCustomerReview(retry), true);
  assert.equal(await deliverNextCustomerReview(retry), false);
  assert.deepEqual(send.mock.calls.map(({ arguments: [input] }) => input.product.productId), ["product-one", "product-one", "product-three"]);
  assert.equal(order.customerReviewNextAttemptAt, undefined);
});
