const { test } = require("node:test");
const assert = require("node:assert/strict");
const env = require("../config/env");
const Account = require("../models/WhatsAppAccount");
const Conversation = require("../models/WhatsAppConversation");
const Greeting = require("../models/WhatsAppGreeting");
const GreetingLog = require("../models/WhatsAppGreetingLog");
const Message = require("../models/WhatsAppMessage");
const { buildInteractiveFromGreeting, sendGreetingForAccount } = require("../services/whatsappGreetingService");
const { publishWelcomeMessageSequence } = require("../services/whatsappCloudApiService");
const { sendOrderConfirmationWhatsApp, sendPaymentReceivedWhatsApp } = require("../services/whatsappTransactionalService");

const headerText = "Welcome to Prakash Electronics";
const bodyText = "How can we help?";
const footerText = "Store support";
const imageUrl = "https://example.test/store.jpg";
const customerWaId = "919876543210";

test("optional greeting headers render with buttons, image captions and headers on text messages", () => {
  const buttons = [{ type: "quick_reply", label: "Repairs", payload: "repair" }];
  const interactive = buildInteractiveFromGreeting({ messages: [{ headerText, bodyText, footerText, imageUrl, buttons }] });
  assert.deepEqual(interactive.interactive.header, { type: "text", text: headerText });
  assert.deepEqual(interactive.interactive.footer, { text: footerText });
  assert.deepEqual(interactive.extraImages, [imageUrl]);
  assert.equal(interactive.interactive.action.buttons[0].reply.id, "repair");

  const oldImage = buildInteractiveFromGreeting({ bodyText, imageUrl, buttons });
  assert.deepEqual(oldImage.interactive.header, { type: "image", image: { link: imageUrl } });
  const caption = `*${headerText}*\n\n${bodyText}\n\n${footerText}`;
  assert.equal(buildInteractiveFromGreeting({ headerText, bodyText, footerText, imageUrl }).caption, caption);
  assert.equal(buildInteractiveFromGreeting({ headerText, bodyText, footerText }).text, caption);
  assert.equal(buildInteractiveFromGreeting({ headerText }).text, `*${headerText}*`);
});

test("order welcome is sent before confirmation and only once per customer", async (t) => {
  const previousSettings = { enabled: env.whatsapp.enabled, orderConfirm: env.whatsapp.templates.orderConfirm,
    paymentReceived: env.whatsapp.templates.paymentReceived };
  t.after(() => {
    env.whatsapp.enabled = previousSettings.enabled;
    env.whatsapp.templates.orderConfirm = previousSettings.orderConfirm;
    env.whatsapp.templates.paymentReceived = previousSettings.paymentReceived;
  });
  env.whatsapp.enabled = true;
  env.whatsapp.templates.orderConfirm = "test_order_confirm";
  env.whatsapp.templates.paymentReceived = "test_payment_received";

  const account = { _id: "account", phoneNumberId: "phone-id", accessToken: "test-token" };
  const conversation = { _id: "conversation", async save() {} };
  const order = { orderId: "PE-WELCOME", customer: { name: "Test", whatsappNumber: customerWaId }, total: 100 };
  const greeting = { messages: [{ headerText, bodyText, footerText }], orderTemplateName: "test_order_welcome", orderTemplateLanguage: "en_US" };
  let openWindow = false;
  let returning = false;
  const claimed = new Map();
  const sent = [];

  t.mock.method(Account, "findOne", () => ({ sort: async () => account }));
  t.mock.method(Conversation, "findOneAndUpdate", async () => conversation);
  t.mock.method(Conversation, "findById", async () => conversation);
  t.mock.method(Greeting, "findOne", () => ({ lean: async () => greeting }));
  t.mock.method(GreetingLog, "createIndexes", async () => {});
  t.mock.method(GreetingLog, "findOneAndUpdate", async (query, update) => {
    if (claimed.has(query.customerWaId)) throw Object.assign(new Error("Duplicate claim"), { code: 11000 });
    claimed.set(query.customerWaId, update.$set);
  });
  t.mock.method(GreetingLog, "updateOne", async (query, update) => {
    assert.equal(claimed.get(query.customerWaId).claimId, query.claimId);
    if (update.$set?.sentAt) claimed.set(query.customerWaId, { sentAt: update.$set.sentAt });
    else claimed.delete(query.customerWaId);
  });
  t.mock.method(GreetingLog, "findOne", (query) => ({ select: () => ({ lean: async () => claimed.get(query.customerWaId) }) }));
  t.mock.method(Message, "exists", async (query) => query.direction === "inbound" ? openWindow : returning);
  t.mock.method(Message, "findOne", () => ({ lean: async () => null }));
  t.mock.method(Message, "create", async (message) => message);
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return Response.json({ messages: [{ id: `wamid.${sent.length}` }] });
  });

  await sendOrderConfirmationWhatsApp({ order: { ...order, orderId: "PE-NO-CONSENT",
    customer: { ...order.customer, whatsappNumber: "919876543219" } } });
  assert.deepEqual(sent.splice(0).map((message) => message.template.name), ["test_order_confirm"]);

  order.whatsappOrderGreetingOptIn = true;
  await sendOrderConfirmationWhatsApp({ order });
  assert.deepEqual(sent.splice(0).map((message) => message.template.name), ["test_order_welcome", "test_order_confirm"]);
  assert.ok(conversation.greetingSentAt instanceof Date);
  await sendPaymentReceivedWhatsApp({ order });
  assert.deepEqual(sent.splice(0).map((message) => message.template.name), ["test_payment_received"]);

  openWindow = true;
  const options = { account, conversationId: conversation._id, customerWaId: "919876543211", order };
  const simultaneous = await Promise.all([sendGreetingForAccount(options), sendGreetingForAccount(options)]);
  assert.ok(simultaneous.every((result) => result.sent));
  assert.deepEqual(sent.splice(0).map((message) => message.text.body), [`*${headerText}*\n\n${bodyText}\n\n${footerText}`]);
  returning = true;
  assert.equal((await sendGreetingForAccount({ ...options, customerWaId: "919876543212" })).reason, "returning_customer");
  assert.equal(sent.length, 0);

  const reset = { ...options, customerWaId: customerWaId, conversationId: "new-conversation", resetBeforeFirstInbound: true };
  claimed.delete(customerWaId); // Admin deletion resets the previous greeting claim.
  assert.equal((await sendGreetingForAccount(reset)).reason, "awaiting_first_message");
  t.mock.method(Message, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => ({ waMessageId: "after-delete" }) }) }) }));
  assert.equal((await sendGreetingForAccount({ ...reset, firstMessageId: "after-delete" })).sent, true);
  assert.equal((await sendGreetingForAccount({ ...reset, firstMessageId: "later-message" })).reason, "returning_customer");
  assert.equal(sent.length, 1);
});

test("an ad welcome uses Meta's WABA multipart sequence endpoint", async (t) => {
  const sequence = { text: `${headerText}\n\n${bodyText}`, ice_breakers: [{ title: "Repairs" }] };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /\/123\/welcome_message_sequences$/);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.headers["Content-Type"], undefined);
    assert.equal(options.body.get("name"), "Pulse welcome");
    assert.equal(options.body.get("sequence_id"), "456");
    assert.deepEqual(JSON.parse(options.body.get("welcome_message_sequence")), sequence);
    return Response.json({ success: true });
  });
  assert.deepEqual(await publishWelcomeMessageSequence({ businessAccountId: "123", accessToken: "test-token",
    sequenceId: "456", name: "Pulse welcome", sequence }), { success: true });
});

test("new messages trigger greeting before permission and chat, while returning messages skip both", async (t) => {
  const previous = [env.whatsapp.enabled, env.metaApp.appSecret, env.pulseVoice.enabled];
  t.after(() => {
    [env.whatsapp.enabled, env.metaApp.appSecret, env.pulseVoice.enabled] = previous;
  });
  env.whatsapp.enabled = true;
  env.metaApp.appSecret = "test-signing-secret";
  env.pulseVoice.enabled = false;

  const { createHmac } = require("node:crypto");
  const account = { _id: "account", phoneNumberId: "123" };
  const conversation = { _id: "conversation", async save() {} };
  t.mock.method(Account, "findOne", async () => account);
  t.mock.method(Greeting, "findOne", () => ({ lean: async () => ({ messages: [{ headerText }] }) }));
  const record = t.mock.method(require("../services/whatsappConversationService"), "recordMessage", async () => ({ conversation, duplicate: false }));
  const handled = [];
  t.mock.method(Message, "exists", async (filter) => filter.direction === "inbound");
  t.mock.method(Message, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => ({ waMessageId: "direct" }) }) }) }));
  t.mock.method(GreetingLog, "findOneAndUpdate", async () => ({}));
  t.mock.method(GreetingLog, "updateOne", async () => ({}));
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).text.body, `*${headerText}*`);
    handled.push("greeting");
    return Response.json({ messages: [{ id: "greeting-id" }] });
  });
  t.mock.method(require("../services/whatsappVoicePermissionService"), "sendAfterGreeting", async () => handled.push("permission"));
  t.mock.method(require("../services/whatsappAIService"), "maybeReplyWithAI", async ({ customerMessage }) => handled.push(customerMessage));
  const { handleWhatsAppWebhook } = require("../controllers/whatsappWebhookController");

  const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "123" }, messages: [
      { id: "direct", from: customerWaId, type: "text", text: { body: "Hi directly" } },
      { id: "second", from: customerWaId, type: "text", text: { body: "My next message" } },
      { id: "old_event", from: "919876543212", type: "request_welcome" },
    ],
  } }] }] }));
  const signature = `sha256=${createHmac("sha256", env.metaApp.appSecret).update(body).digest("hex")}`;
  let status;
  let failure;
  const res = { status(code) { status = code; return this; }, json() {} };
  handleWhatsAppWebhook({ body, get: () => signature }, res, (error) => { failure = error; });
  await new Promise(setImmediate);
  assert.ifError(failure);
  assert.equal(status, 200);
  assert.deepEqual(handled, ["greeting", "permission", "Hi directly", "My next message"]);
  assert.equal(record.mock.callCount(), 3);
});
