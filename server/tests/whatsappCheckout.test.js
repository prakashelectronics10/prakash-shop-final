const test = require("node:test");
const assert = require("node:assert/strict");
process.env.META_CATALOG_ID = "catalog";
process.env.RAZORPAY_KEY_ID = "rzp_live_checkout_fixture";
process.env.RAZORPAY_KEY_SECRET = "test-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook";
const Order = require("../models/Order");
const Settings = require("../models/WhatsAppAISettings");
const notifications = require("../services/orderNotificationService");
const enqueued = [];
notifications.enqueueOrderPaidNotification = (order) => enqueued.push(order);
const { handleCheckoutButton, previewCheckout, validLinkPayment, confirmLinkPayment, fingerprint, getCheckoutOptions } = require("../services/whatsappCheckoutService");
const controller = require("../controllers/orderController");
const { whatsAppAISettingsSchema } = require("../validations/whatsappSchemas");
test.beforeEach((t) => {
  t.mock.method(Order.collection, "createIndex", async () => "test_index");
});

const customer = { name: "Test Customer", phone: "9876543210", whatsappNumber: "9876543210", address: "12 Main Road, Ranchi", pincode: "834001" };
const items = [{ sourceType: "shop-product", sourceId: "66b000000000000000000001", quantity: 1 }];
const quote = { items: [{ productId: items[0].sourceId, productName: "Test lamp", retailerId: "LAMP", quantity: 1, unitPrice: 500, discountedLineTotal: 500 }], subtotal: 500, discountTotal: 0, total: 525, additionalCharges: [{ slug: "delivery-charge", name: "Delivery", amount: 25 }] };
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

test("payment options report missing worker configuration without offering COD when disabled", async (t) => {
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ enhancedPaymentsEnabled: true, codEnabled: false }) }));
  const env = require("../config/env");
  const { razorpay } = env;
  const secret = razorpay.keySecret;
  const keyId = razorpay.keyId;
  const nodeEnv = env.nodeEnv;
  t.after(() => { razorpay.keySecret = secret; razorpay.keyId = keyId; env.nodeEnv = nodeEnv; });
  razorpay.keySecret = "";
  assert.deepEqual(await getCheckoutOptions(account), { online: false, cod: false, onlineIssue: "razorpay_not_configured" });
  razorpay.keySecret = secret;
  assert.deepEqual(await getCheckoutOptions(account), { online: true, cod: false });
  razorpay.keyId = "rzp_test_checkout_fixture";
  env.nodeEnv = "development";
  assert.deepEqual(await getCheckoutOptions(account), { online: true, cod: false });
  env.nodeEnv = "production";
  assert.deepEqual(await getCheckoutOptions(account), { online: false, cod: false, onlineIssue: "razorpay_live_key_required" });
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
    assert.equal(update.$set.invoiceWhatsAppNextAttemptAt, update.$set.paidAt);
    return calls++ === 0 ? { ...online, ...update.$set } : null;
  });
  assert.equal(await confirmLinkPayment(online, link, payment), true);
  assert.equal(await confirmLinkPayment(online, link, payment), false);
  assert.equal(enqueued.length, 1);
});

test("a voice order uses shared checkout and becomes confirmed only after captured Razorpay payment", async (t) => {
  const { createVoiceTools, createConfirmation } = require("../services/whatsappVoiceTools");
  const consent = createConfirmation();
  let stored;
  const voiceMessages = [];
  const call = { _id: "voice-call-test", phone: "919876543210" };
  t.mock.method(Order, "findOne", async () => stored || null);
  t.mock.method(Order, "findOneAndUpdate", async (_filter, { $set }) => {
    if (stored.paymentStatus === "paid") return null;
    Object.assign(stored, $set);
    return stored;
  });
  const { metaCatalog } = require("../config/env");
  const priorCatalog = metaCatalog.catalogId;
  metaCatalog.catalogId = "";
  t.after(() => { metaCatalog.catalogId = priorCatalog; });
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: false, enhancedPaymentsEnabled: false }) }));
  t.mock.method(controller, "buildOrderQuote", async () => ({ ...quote, items: quote.items.map(({ retailerId, ...item }) => item) }));
  const create = t.mock.method(Order, "create", async (data) => { stored = { ...data, _id: online._id, async save() {} }; return stored; });
  const paymentTemplate = t.mock.method(require("../services/whatsappPaymentRequestService"), "getPaymentTemplate", async () => { throw new Error("voice does not use catalog cards"); });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).includes("reference_id=")) return Response.json({ payment_links: [] });
    assert.equal(options.method, "POST");
    assert.equal(JSON.parse(options.body).amount, 52500);
    return Response.json({ id: "plink_test", reference_id: stored.orderId, amount: 52500,
      currency: "INR", short_url: "https://rzp.io/rzp/test", status: "created" });
  });
  const tools = createVoiceTools({ call, account, consent, services: {
    Call: { exists: async () => true }, getConversation: async () => ({ _id: conversation()._id }),
    sendPaymentRequest: async ({ orderId }) => { voiceMessages.push(orderId); return { sent: true }; },
  } });
  assert.deepEqual(await tools.get_order_options.execute({}), { online: true, cod: false });
  const { name, address, pincode } = customer;
  const draft = { items, customer: { name, address, pincode } };
  assert.equal((await tools.review_order.execute({ ...draft, method: "cod" })).status, "cod_unavailable");
  assert.equal((await tools.review_order.execute({ ...draft, method: "online" })).summary.total, 525);
  assert.equal((await tools.submit_order.execute({})).status, "awaiting_confirmation");
  assert.equal(create.mock.callCount(), 0);

  consent.speechStarted(Date.now() + 1, "voice-consent");
  consent.transcript({ isFinal: true, itemId: "voice-consent", transcript: "Order confirm kar do aur WhatsApp pe link bhej do" });
  const placed = await tools.submit_order.execute({});
  assert.equal(placed.status, "awaiting_payment");
  assert.equal(placed.reference, stored.orderId);
  assert.equal(placed.whatsappAccepted, true);
  assert.equal(stored.whatsappVoiceCall, call._id);
  assert.equal(stored.customer.phone, customer.phone);
  assert.equal(stored.orderStatus, "awaiting_payment");
  await tools.submit_order.execute({});
  assert.equal(create.mock.callCount(), 1);
  assert.equal(paymentTemplate.mock.callCount(), 0);
  assert.deepEqual(voiceMessages, [stored.orderId]);

  const capturedLink = { ...link, reference_id: stored.orderId };
  assert.equal(await confirmLinkPayment(stored, capturedLink, { ...payment, status: "authorized" }), false);
  assert.equal(await confirmLinkPayment(stored, capturedLink, payment), true);
  assert.equal(stored.orderStatus, "confirmed");
  assert.equal(stored.paymentStatus, "paid");
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
  const { getOrderChargeSnapshots } = require("../services/additionalChargeService");
  const AdditionalCharge = require("../models/AdditionalCharge");
  const { updateCharge } = require("../controllers/additionalChargeController");
  const delivery = { name: "Delivery charge", slug: "delivery-charge", amount: 25, isActive: true, isSystem: true, sortOrder: -100 };
  let savedRate;
  const platform = new AdditionalCharge({ name: "Platform fee", slug: "platform-fee", isActive: true, isSystem: true, sortOrder: -99 });
  t.mock.method(platform, "save", async () => { savedRate = platform.ratePercent; });
  t.mock.method(AdditionalCharge, "findById", async () => platform);
  t.mock.method(AdditionalCharge, "findOne", async ({ slug }) => slug === delivery.slug ? delivery : platform);
  t.mock.method(AdditionalCharge, "find", () => ({ sort: () => ({ lean: async () => [
    delivery, { ...platform.toObject(), ratePercent: savedRate }, { name: "Handling", slug: "handling", amount: 10 },
  ] }) }));
  const editRate = (ratePercent) => new Promise((resolve, reject) =>
    updateCharge({ params: { id: platform.id }, body: { ratePercent } }, { json: resolve }, reject));
  assert.equal((await getOrderChargeSnapshots(100.50))[1].amount, 3.02);
  await assert.rejects(editRate(""), { statusCode: 400 });
  assert.equal((await editRate("0")).data.ratePercent, 0);
  assert.equal((await getOrderChargeSnapshots(500))[1].amount, 0);
  assert.equal((await editRate("3.5")).data.ratePercent, 3.5);
  const additionalCharges = await getOrderChargeSnapshots(quote.subtotal);
  assert.deepEqual(additionalCharges.map(({ slug, amount }) => [slug, amount]), [
    ["delivery-charge", 25], ["platform-fee", 17.5], ["handling", 10],
  ]);
  const pricedQuote = { ...quote, additionalCharges, total: 552.5 };
  let stored;
  let createdLinks = 0;
  t.mock.method(Order, "findOne", async () => stored || null);
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: false }) }));
  t.mock.method(controller, "buildOrderQuote", async () => pricedQuote);
  const create = t.mock.method(Order, "create", async (data) => { stored = { ...data, _id: online._id, async save() {} }; return stored; });
  t.mock.method(global, "fetch", async (url, opts) => {
    if (String(url).includes("reference_id=")) return Response.json({ payment_links: [] });
    if (opts?.method === "POST") {
      const body = JSON.parse(opts.body);
      assert.equal(body.amount, 55250);
      assert.equal(body.reference_id, stored.orderId);
      assert.equal(body.accept_partial, false);
      createdLinks++;
    }
    return Response.json({ id: "plink_test", reference_id: stored.orderId, amount: 55250, currency: "INR", short_url: "https://rzp.io/rzp/test", status: "created", expire_by: Math.floor(Date.now() / 1000) + 3600 });
  });
  const args = { account, conversation: conversation(), buttonReplyId: "checkout:online:review-token" };
  args.conversation.checkout.quoteHash = fingerprint(pricedQuote);
  assert.match((await handleCheckoutButton(args)).text, /confirm nahi hua/);
  await handleCheckoutButton(args);
  assert.equal(stored.paymentStatus, "pending");
  assert.equal(stored.orderStatus, "awaiting_payment");
  assert.equal(create.mock.callCount(), 1);
  assert.equal(createdLinks, 1);
  const { orderDetailsComponents } = require("../services/whatsappPaymentRequestService");
  const details = orderDetailsComponents(stored)[2].parameters[0].action.order_details;
  assert.equal(details.total_amount.value, 55250);
  assert.equal(details.order.shipping.value, 5250);
  assert.match(details.order.shipping.description, /Platform fee Rs 17.5/);
  assert.equal(details.payment_settings[0].payment_link.uri, stored.paymentLinkUrl);
  const paidLink = { ...link, reference_id: stored.orderId, amount: 55250, amount_paid: 55250 };
  assert.equal(validLinkPayment(stored, paidLink, payment), false);
  assert.equal(validLinkPayment(stored, paidLink, { ...payment, amount: 55250 }), true);
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

test("a returning number must confirm its saved delivery before the formatted order review", async (t) => {
  const convo = conversation();
  convo.checkout = undefined;
  t.mock.method(Order, "findOne", (filter) => {
    if (filter.checkoutKey) return null;
    assert.deepEqual(filter["customer.whatsappNumber"].$in, ["9876543210", "919876543210", "+919876543210"]);
    return { sort: () => ({ select: () => ({ lean: async () => ({ customer: { ...customer, message: "Old instruction" } }) }) }) };
  });
  t.mock.method(controller, "buildOrderQuote", async () => quote);
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ codEnabled: false }) }));
  const delivery = await previewCheckout({ account, conversation: convo, patch: { items } });
  assert.match(delivery.text, /Saved delivery details\*\n\nName: Test Customer\nPhone: 9876543210/);
  assert.doesNotMatch(delivery.text, /Old instruction/);
  const token = convo.checkout.token;
  const blocked = await handleCheckoutButton({ account, conversation: convo, buttonReplyId: `checkout:online:${token}` });
  assert.match(blocked.text, /Pehle Confirm delivery/);
  const review = await handleCheckoutButton({ account, conversation: convo, buttonReplyId: `checkout:delivery:${token}` });
  assert.match(review.text, /\*Products\*\n[^]*\n\n\*Payment summary\*\n[^]*\n\n\*Delivery details\*/);
  assert.ok(review.buttons.some((entry) => entry.label === "Pay online"));
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
