const test = require("node:test");
const assert = require("node:assert/strict");
process.env.RAZORPAY_KEY_ID = "rzp_test_checkout";
process.env.RAZORPAY_KEY_SECRET = "test-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook";
const Order = require("../models/Order");
const Settings = require("../models/WhatsAppAISettings");
const notifications = require("../services/orderNotificationService");
const enqueued = [];
notifications.enqueueOrderPaidNotification = (order) => enqueued.push(order);
const { handleCheckoutButton, previewCheckout, validLinkPayment, confirmLinkPayment, fingerprint } = require("../services/whatsappCheckoutService");
const controller = require("../controllers/orderController");
const { whatsAppAISettingsSchema } = require("../validations/whatsappSchemas");
test.beforeEach((t) => {
  t.mock.method(Order.collection, "createIndex", async () => "test_index");
});

const customer = { name: "Test Customer", phone: "9876543210", whatsappNumber: "9876543210", address: "12 Main Road, Ranchi", pincode: "834001" };
const items = [{ sourceType: "shop-product", sourceId: "66b000000000000000000001", quantity: 1 }];
const quote = { items: [{ productId: items[0].sourceId, productName: "Test lamp", quantity: 1, unitPrice: 500, discountedLineTotal: 500 }], subtotal: 500, discountTotal: 0, total: 525, additionalCharges: [{ slug: "delivery-charge", name: "Delivery", amount: 25 }] };
function conversation() { return { _id: "66b000000000000000000002", customerWaId: "919876543210", checkout: { token: "review-token", updatedAt: Date.now(), customer, items, quoteHash: fingerprint(quote) }, markModified() {}, async save() {} }; }
const account = { _id: "66b000000000000000000003" };
const online = { _id: "66b000000000000000000004", orderId: "PETEST", source: "whatsapp", paymentMethod: "online", paymentStatus: "pending", orderStatus: "awaiting_payment", total: 525, razorpayPaymentLinkId: "plink_test" };
const link = { id: "plink_test", reference_id: "PETEST", currency: "INR", amount: 52500, amount_paid: 52500, status: "paid", order_id: "order_test" };
const payment = { id: "pay_test", order_id: "order_test", currency: "INR", amount: 52500, status: "captured" };

test("COD defaults off in both storage and admin validation; unpaid orders default unconfirmed", () => {
  assert.equal(new Settings({ account: account._id }).codEnabled, false);
  assert.equal(whatsAppAISettingsSchema.parse({ accountId: account._id }).codEnabled, false);
  assert.equal(new Order().orderStatus, "awaiting_payment");
});

test("only full captured payment for the exact link, reference, order and currency qualifies", () => {
  assert.equal(validLinkPayment(online, link, payment), true);
  for (const change of [{ status: "authorized" }, { amount: 1 }, { order_id: "other" }, { currency: "USD" }]) {
    assert.equal(validLinkPayment(online, link, { ...payment, ...change }), false);
  }
  for (const change of [{ id: "other" }, { reference_id: "other" }, { status: "partially_paid" }, { amount_paid: 100 }, { amount: 100 }]) {
    assert.equal(validLinkPayment(online, { ...link, ...change }, payment), false);
  }
  assert.equal(validLinkPayment({ ...online, paymentMethod: "cod" }, link, payment), false);
});

test("repeated paid webhook atomically confirms and notifies once", async (t) => {
  enqueued.length = 0;
  let calls = 0;
  t.mock.method(Order, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.orderStatus, "awaiting_payment");
    assert.deepEqual(filter.paymentStatus.$in, ["pending", "failed"]);
    assert.equal(update.$set.orderStatus, "confirmed");
    assert.equal(update.$set.paymentStatus, "paid");
    return calls++ === 0 ? { ...online, ...update.$set } : null;
  });
  assert.equal(await confirmLinkPayment(online, link, payment), true);
  assert.equal(await confirmLinkPayment(online, link, payment), false);
  assert.equal(enqueued.length, 1);
});

test("stale review button does not query or create an order", async (t) => {
  t.mock.method(Order, "findOne", () => { throw new Error("must not query"); });
  const result = await handleCheckoutButton({ account, conversation: conversation(), buttonReplyId: "checkout:cod:old" });
  assert.match(result.text, /purana/);
});

test("COD turned off after review blocks creation using current settings", async (t) => {
  t.mock.method(Order, "findOne", async () => null);
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: false }) }));
  t.mock.method(Order, "create", () => { throw new Error("must not create"); });
  const result = await handleCheckoutButton({ account, conversation: conversation(), buttonReplyId: "checkout:cod:review-token" });
  assert.match(result.text, /COD service available nahi/);
});

test("enabled COD creates one confirmed order with payment due, never paid", async (t) => {
  enqueued.length = 0;
  let stored;
  t.mock.method(Order, "findOne", async () => stored || null);
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: true }) }));
  t.mock.method(controller, "buildOrderQuote", async () => quote);
  const create = t.mock.method(Order, "create", async (data) => { stored = { ...data, _id: online._id }; return stored; });
  const convo = conversation();
  const args = { account, conversation: convo, buttonReplyId: "checkout:cod:review-token" };
  assert.match((await handleCheckoutButton(args)).text, /Cash on Delivery/);
  assert.match((await handleCheckoutButton(args)).text, /Cash on Delivery/);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(stored.orderStatus, "confirmed");
  assert.equal(stored.paymentStatus, "cod");
  assert.equal(stored.paidAt, undefined);
  assert.equal(enqueued.length, 1);
});

test("online checkout persists pending order, reuses link on retry and never confirms before payment", async (t) => {
  t.mock.method(require("../services/whatsappPaymentRequestService"), "getPaymentTemplate", async () => ({ name: "pulse_order_payment", language: "en", prefix: "https://rzp.io/rzp/" }));
  let stored;
  let createdLinks = 0;
  t.mock.method(Order, "findOne", async () => stored || null);
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: false }) }));
  t.mock.method(controller, "buildOrderQuote", async () => quote);
  const create = t.mock.method(Order, "create", async (data) => { stored = { ...data, _id: online._id, async save() {} }; return stored; });
  t.mock.method(global, "fetch", async (url, opts) => {
    if (String(url).includes("reference_id=")) return Response.json({ payment_links: [] });
    if (opts?.method === "POST") {
      const body = JSON.parse(opts.body);
      assert.equal(body.amount, 52500);
      assert.equal(body.accept_partial, false);
      createdLinks++;
    }
    return Response.json({ id: "plink_test", reference_id: stored.orderId, amount: 52500, currency: "INR", short_url: "https://rzp.io/rzp/test", status: "created", expire_by: Math.floor(Date.now() / 1000) + 3600 });
  });
  const args = { account, conversation: conversation(), buttonReplyId: "checkout:online:review-token" };
  assert.match((await handleCheckoutButton(args)).text, /confirm nahi hua/);
  await handleCheckoutButton(args);
  assert.equal(stored.paymentStatus, "pending");
  assert.equal(stored.orderStatus, "awaiting_payment");
  assert.equal(create.mock.callCount(), 1);
  assert.equal(createdLinks, 1);
});

test("review uses server totals and collects missing required address fields", async (t) => {
  t.mock.method(Order, "findOne", async () => null);
  t.mock.method(controller, "buildOrderQuote", async () => quote);
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: true }) }));
  const convo = conversation();
  let result = await previewCheckout({ account, conversation: convo, patch: { customer: { pincode: "" } } });
  assert.match(result.text, /pincode/);
  assert.equal(result.buttons.length, 0);
  result = await previewCheckout({ account, conversation: convo, patch: { customer: { pincode: "834001" } } });
  assert.match(result.text, /525.00/);
  assert.ok(result.buttons.some((b) => b.label === "Confirm COD"));
  assert.notEqual(convo.checkout.token, "review-token");
});

test("price changes require a fresh review instead of creating an order", async (t) => {
  t.mock.method(Order, "findOne", async () => null);
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: true }) }));
  t.mock.method(controller, "buildOrderQuote", async () => ({ ...quote, total: 600 }));
  const create = t.mock.method(Order, "create", () => { throw new Error("must not create"); });
  const result = await handleCheckoutButton({ account, conversation: conversation(), buttonReplyId: "checkout:cod:review-token" });
  assert.match(result.text, /600.00/);
  assert.equal(create.mock.callCount(), 0);
});

test("Razorpay webhook rejects an invalid signature before looking up orders", async (t) => {
  const lookup = t.mock.method(Order, "findOne", () => { throw new Error("must not query"); });
  const error = await new Promise((resolve) => controller.handleRazorpayWebhook({
    body: Buffer.from(JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: link }, payment: { entity: payment } } })),
    get: () => "invalid",
  }, { json: () => resolve(null) }, resolve));
  assert.equal(error.statusCode, 400);
  assert.equal(lookup.mock.callCount(), 0);
});

test("signed payment_link.paid webhook confirms a matching pending WhatsApp order", async (t) => {
  const crypto = require("node:crypto");
  enqueued.length = 0;
  t.mock.method(Order, "findOne", async () => online);
  t.mock.method(Order, "findOneAndUpdate", async (_filter, update) => ({ ...online, ...update.$set }));
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: link }, payment: { entity: payment } } }));
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
  const result = await new Promise((resolve, reject) => controller.handleRazorpayWebhook({ body, get: () => signature }, { json: resolve }, reject));
  assert.equal(result.success, true);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].paymentStatus, "paid");
});
