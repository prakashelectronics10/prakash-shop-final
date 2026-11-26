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

test("WhatsApp history links bind the sender number and can only be exchanged once", async (t) => {
  const { createOrderHistoryLink, approveOrderHistoryBrowser, exchangeOrderHistoryLink, verifiedOrderHistoryNumber } =
    require("../services/customerWhatsAppOtpService");
  const id = "ab".repeat(12);
  const business = { phoneNumberId: "wa-business-id", businessNumber: "+91 9000000002" };
  let record;
  t.mock.method(Otp, "create", async (fields) => (record = { _id: id, ...fields }));
  t.mock.method(Otp, "findOneAndUpdate", async (filter, update) => {
    if (filter._id !== record._id || filter.purpose !== record.purpose || record.expiresAt <= filter.expiresAt.$gt) return null;
    if (filter.whatsappNumber && (filter.whatsappNumber !== record.whatsappNumber
      || filter.historyLinkPhoneNumberId !== record.historyLinkPhoneNumberId
      || (record.historyLinkBrowserHash && filter.$or[1].historyLinkBrowserHash !== record.historyLinkBrowserHash))) return null;
    if (filter.otpHash && (filter.otpHash !== record.otpHash || filter.historyLinkBrowserHash !== record.historyLinkBrowserHash)) return null;
    Object.assign(record, update.$set);
    return record;
  });
  t.mock.method(Otp, "findOne", (filter) => ({ select: () => ({ lean: async () =>
    record.purpose === filter.purpose && record.expiresAt > filter.expiresAt.$gt
      && (filter.otpHash ? filter.otpHash === record.otpHash : record.verifiedTokenHash === filter.verifiedTokenHash) ? record : null,
  }) }));
  assert.equal(await createOrderHistoryLink("449000000001", business), null);
  const url = new URL(await createOrderHistoryLink("919000000001", business));
  assert.equal(url.pathname, "/orders");
  assert.equal(url.search, "");
  const code = new URLSearchParams(url.hash.slice(1)).get("viewOrders");
  const originalToken = code.split(".")[1];
  assert.equal(record.otpHash, Otp.hashToken(originalToken));
  await assert.rejects(verifiedOrderHistoryNumber({ challengeId: id, verifiedToken: originalToken }), { statusCode: 401 });
  const ownerBrowser = "1".repeat(64);
  const otherBrowser = "2".repeat(64);
  const pendingOwner = await exchangeOrderHistoryLink(code, ownerBrowser);
  const pendingOther = await exchangeOrderHistoryLink(code, otherBrowser);
  assert.equal(pendingOther.verifiedToken, undefined);
  assert.notEqual(pendingOther.confirmationUrl, pendingOwner.confirmationUrl);
  const approval = { challengeId: id, browserHash: Otp.hashToken(ownerBrowser), senderWaId: "919000000001", phoneNumberId: business.phoneNumberId };
  assert.equal(await approveOrderHistoryBrowser({ ...approval, senderWaId: "919000000003" }), false);
  assert.equal(await approveOrderHistoryBrowser({ ...approval, phoneNumberId: "other-business" }), false);
  assert.equal(await approveOrderHistoryBrowser(approval), true);
  await assert.rejects(exchangeOrderHistoryLink(code, otherBrowser), { statusCode: 401 });
  const exchanges = await Promise.allSettled([exchangeOrderHistoryLink(code, ownerBrowser), exchangeOrderHistoryLink(code, ownerBrowser)]);
  assert.equal(exchanges.filter(({ status }) => status === "fulfilled").length, 1);
  const { value } = exchanges.find(({ status }) => status === "fulfilled");
  assert.notEqual(value.verifiedToken, originalToken);
  assert.equal(await verifiedOrderHistoryNumber(value), "9000000001");
  await assert.rejects(verifiedOrderHistoryNumber({ challengeId: id, verifiedToken: originalToken }), { statusCode: 401 });
  const expiredUrl = new URL(await createOrderHistoryLink("919000000001", business));
  record.expiresAt = new Date(0);
  await assert.rejects(exchangeOrderHistoryLink(new URLSearchParams(expiredUrl.hash.slice(1)).get("viewOrders"), ownerBrowser), { statusCode: 401 });
});
