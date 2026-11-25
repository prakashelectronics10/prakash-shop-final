const assert = require("node:assert/strict");
const test = require("node:test");
const Order = require("../models/Order");

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
