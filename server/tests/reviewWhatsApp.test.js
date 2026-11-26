const test = require("node:test");
const assert = require("node:assert/strict");
const { Types } = require("mongoose");
const ProductReview = require("../models/ProductReview");
const ReviewWhatsAppSettings = require("../models/ReviewWhatsAppSettings");
const ReviewWhatsAppOtp = require("../models/ReviewWhatsAppOtp");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const env = require("../config/env");
const whatsapp = require("../services/whatsappCloudApiService");
const transactionalWhatsApp = require("../services/whatsappTransactionalService");
const controller = require("../controllers/reviewWhatsAppController");
const service = require("../services/reviewWhatsAppService");
const template = require("../config/product-review-alert-template.json");

const account = { phoneNumberId: "123456", accessToken: "test-token" };
const recipient = { _id: new Types.ObjectId(), whatsappNumber: "9876543210" };
const generation = new Types.ObjectId();
const delivery = { _id: new Types.ObjectId(), recipientId: recipient._id, messageId: "wamid.test", phoneNumberId: account.phoneNumberId };
const review = { _id: new Types.ObjectId(), productName: "Bluetooth speaker", rating: 4, review: "Clear\nsound", whatsappGeneration: generation, whatsappDeliveries: [delivery] };

function enableProvider(t) {
  const previous = [env.whatsapp.enabled, env.metaApp.appSecret, env.jwtSecret];
  env.whatsapp.enabled = true;
  env.metaApp.appSecret = "test-meta-secret";
  env.jwtSecret = "test-jwt-secret";
  t.after(() => { [env.whatsapp.enabled, env.metaApp.appSecret, env.jwtSecret] = previous; });
}

function request(handler, input) {
  return new Promise((resolve, reject) => {
    handler(input, { set() { return this; }, json(payload) { resolve(payload.data); } }, reject);
  });
}

test("disabled settings queue nothing and enabled settings capture each verified recipient without copying phone numbers", async (t) => {
  enableProvider(t);
  const settings = { enabled: false, generation, recipients: [recipient, { _id: new Types.ObjectId() }] };
  t.mock.method(ReviewWhatsAppSettings, "findById", () => ({ lean: async () => settings }));
  assert.deepEqual(await service.prepareReviewAlerts(), {});
  settings.enabled = true;
  const queued = await service.prepareReviewAlerts();
  assert.equal(queued.whatsappGeneration, generation);
  assert.deepEqual(queued.whatsappDeliveries.map((item) => item.recipientId), settings.recipients.map((item) => item._id));
  assert.ok(queued.whatsappDeliveries.every((item) => item.nextAttemptAt instanceof Date && !item.whatsappNumber));
});

test("alert delivery matches the Meta template and skips work queued before a settings change", async (t) => {
  enableProvider(t);
  const settings = { enabled: true, generation, recipients: [recipient] };
  t.mock.method(ReviewWhatsAppSettings, "findById", () => ({ lean: async () => settings }));
  t.mock.method(WhatsAppAccount, "findOne", () => ({ sort: async () => account }));
  t.mock.method(ProductReview, "findOneAndUpdate", async (_filter, update) => ({
    ...review,
    whatsappDeliveries: [{ ...delivery, attempts: 1, claim: update.$set["whatsappDeliveries.$.claim"] }],
  }));
  const save = t.mock.method(ProductReview, "updateOne", async () => ({ modifiedCount: 1 }));
  const send = t.mock.method(whatsapp, "sendTemplateMessage", async () => ({ messages: [{ id: "wamid.test" }] }));
  assert.equal(await service.deliverNextReviewAlert(), true);
  const [message] = send.mock.calls[0].arguments;
  assert.equal(message.to, "919876543210");
  assert.equal(message.templateName, env.whatsapp.templates.productReviewAlert);
  assert.deepEqual(message.components[0].parameters.map(({ text }) => text), ["4/5", "Clear sound", "Bluetooth speaker"]);
  assert.equal(message.components.length - 1, template.components.find(({ type }) => type === "BUTTONS").buttons.length);
  assert.equal(save.mock.calls[0].arguments[1].$set["whatsappDeliveries.$.messageId"], "wamid.test");
  settings.generation = new Types.ObjectId();
  await service.deliverNextReviewAlert();
  assert.equal(send.mock.callCount(), 1);
});

test("admin alerts stay queued when Meta has not approved the template", async (t) => {
  enableProvider(t);
  const settings = { enabled: true, generation, recipients: [recipient] };
  t.mock.method(ReviewWhatsAppSettings, "findById", () => ({ lean: async () => settings }));
  t.mock.method(WhatsAppAccount, "findOne", () => ({ sort: async () => account }));
  t.mock.method(ProductReview, "findOneAndUpdate", async (_filter, update) => ({
    ...review,
    whatsappDeliveries: [{ ...delivery, attempts: 5, claim: update.$set["whatsappDeliveries.$.claim"] }],
  }));
  const save = t.mock.method(ProductReview, "updateOne", async () => ({ modifiedCount: 1 }));
  const send = t.mock.method(whatsapp, "sendTemplateMessage", async () => {
    throw Object.assign(new Error("Template not approved"), { payload: { error: { code: 132001 } } });
  });
  await service.deliverNextReviewAlert();
  const [, deferred] = save.mock.calls[0].arguments;
  assert.equal(deferred.$inc["whatsappDeliveries.$.attempts"], -1);
  assert.ok(deferred.$set["whatsappDeliveries.$.nextAttemptAt"] > new Date());
  assert.equal(deferred.$unset["whatsappDeliveries.$.nextAttemptAt"], undefined);

  send.mock.mockImplementation(async () => ({ messages: [{ id: "wamid.approved" }] }));
  await service.deliverNextReviewAlert(deferred.$set["whatsappDeliveries.$.nextAttemptAt"]);
  const [, delivered] = save.mock.calls[1].arguments;
  assert.equal(delivered.$set["whatsappDeliveries.$.messageId"], "wamid.approved");
});

test("moderation buttons require the intended WhatsApp sender and affect only pending reviews", async (t) => {
  enableProvider(t);
  t.mock.method(ProductReview, "findById", () => ({ select() { return this; }, lean: async () => review }));
  const settings = { recipients: [recipient] };
  t.mock.method(ReviewWhatsAppSettings, "findById", () => ({ lean: async () => settings }));
  const update = t.mock.method(ProductReview, "updateOne", async () => ({ modifiedCount: 1 }));
  const send = t.mock.method(whatsapp, "sendTextMessage", async () => ({}));
  const [, approve, decline, later] = service.templateComponents(review, delivery, recipient.whatsappNumber, account.phoneNumberId);
  const event = { type: "button", customerWaId: "919876543210", raw: { context: { id: delivery.messageId } } };
  const reply = (button, overrides = {}) => service.handleReviewAction({ account, event: { ...event, ...overrides, buttonReplyId: button.parameters[0].payload } });
  await reply(approve, { customerWaId: "919000000000" });
  assert.equal(update.mock.callCount(), 0);
  await reply(approve);
  await reply(decline);
  assert.deepEqual(update.mock.calls[0].arguments[0], { _id: String(review._id), status: "pending" });
  assert.deepEqual(update.mock.calls.map(({ arguments: args }) => args[1].$set.status), ["approved", "declined"]);
  await reply(later);
  assert.equal(update.mock.callCount(), 2);
  assert.match(send.mock.calls[2].arguments[0].text, /admin panel/);
  settings.recipients = [];
  await reply(approve);
  assert.equal(update.mock.callCount(), 2);
});

test("adding a number requires a valid one-use WhatsApp code in the original admin session", async (t) => {
  const session = { _id: new Types.ObjectId() };
  const admin = { _id: new Types.ObjectId() };
  let saved;
  t.mock.method(ReviewWhatsAppSettings, "exists", async () => null);
  t.mock.method(ReviewWhatsAppSettings, "updateOne", async () => ({}));
  const add = t.mock.method(ReviewWhatsAppSettings, "findOneAndUpdate", async (_filter, update) => ({ recipients: [update.$push.recipients] }));
  t.mock.method(ReviewWhatsAppOtp, "updateOne", async (filter, update) => { saved = { _id: filter._id, ...update.$set }; });
  t.mock.method(ReviewWhatsAppOtp, "findOneAndUpdate", async (filter) => saved?._id.equals(filter._id) && saved.challengeId.equals(filter.challengeId) ? saved : null);
  t.mock.method(ReviewWhatsAppOtp, "deleteOne", async () => { saved = null; return { deletedCount: 1 }; });
  const send = t.mock.method(transactionalWhatsApp, "sendOtpWhatsApp", async () => ({}));
  const { challengeId } = await request(controller.sendOtp, { adminSession: session, body: { whatsappNumber: "+91 98765 43210" } });
  const { otp } = send.mock.calls[0].arguments[0];
  const input = { adminSession: session, admin, body: { challengeId: String(challengeId), otp } };
  await assert.rejects(request(controller.addRecipient, { ...input, adminSession: { _id: new Types.ObjectId() } }), { statusCode: 400 });
  await assert.rejects(request(controller.addRecipient, { ...input, body: { ...input.body, otp: "000000" } }), { statusCode: 400, message: /Incorrect/ });
  assert.equal(add.mock.callCount(), 0);
  const result = await request(controller.addRecipient, input);
  assert.equal(result.recipients[0].whatsappNumber, "9876543210");
  await assert.rejects(request(controller.addRecipient, input), { statusCode: 400 });
  assert.equal(add.mock.callCount(), 1);
});
