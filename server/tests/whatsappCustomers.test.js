const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Account = require("../models/WhatsAppAccount");
const Conversation = require("../models/WhatsAppConversation");
const Message = require("../models/WhatsAppMessage");
const Greeting = require("../models/WhatsAppGreetingLog");
const State = require("../models/WhatsAppCustomerState");
const { manageCustomer, shouldIgnoreInbound } = require("../services/whatsappCustomerService");
const { sendTextMessage } = require("../services/whatsappCloudApiService");

test("customer block is per sender and deletion removes chat, greeting and block without accepting stale message replays", async (t) => {
  const id = "66b000000000000000000001";
  const accountId = "66b000000000000000000002";
  const customerWaId = "919876543210";
  const phoneNumberId = "123456";
  const session = { test: true };
  let conversation = { _id: id, account: accountId, customerWaId, async save(options) { assert.equal(options.session, session); } };
  let saved;
  const removed = [];
  const priorState = mongoose.connection._readyState;
  mongoose.connection._readyState = 1;
  t.after(() => { mongoose.connection._readyState = priorState; });
  t.mock.method(mongoose.connection, "transaction", async (run) => run(session));
  t.mock.method(Conversation, "findById", (input) => ({ session: async (value) => {
    assert.equal(input, id);
    assert.equal(value, session);
    return conversation;
  } }));
  t.mock.method(Account, "findById", () => ({ select: () => ({ session: async () => ({ phoneNumberId }) }) }));
  t.mock.method(State, "updateOne", async ({ _id }, update, options) => {
    assert.equal(options.session, session);
    saved = { ...saved, _id, ...update.$set, ...update.$max };
    for (const key of Object.keys(update.$unset || {})) delete saved[key];
  });
  t.mock.method(State, "findById", (_id) => ({ lean: async () => saved?._id === _id ? saved : null }));
  t.mock.method(Message, "distinct", () => ({ session: async () => ["deleted-message-id"] }));
  t.mock.method(Message, "deleteMany", async (filter, options) => {
    assert.deepEqual(filter, { conversation: id, account: accountId });
    assert.equal(options.session, session);
    removed.push("messages");
  });
  t.mock.method(Greeting, "deleteOne", async (filter, options) => {
    assert.deepEqual(filter, { account: accountId, customerWaId });
    assert.equal(options.session, session);
    removed.push("greeting");
  });
  t.mock.method(Conversation, "deleteOne", async (filter, options) => {
    assert.equal(filter._id, id);
    assert.equal(options.session, session);
    removed.push("conversation");
    conversation = null;
  });
  const outbound = t.mock.method(globalThis, "fetch", async () => Response.json({ messages: [] }));
  const incoming = { phoneNumberId, customerWaId, timestamp: new Date(), messageId: "fresh-message" };
  const reply = { phoneNumberId, accessToken: "fixture", to: customerWaId, text: "Reply" };

  assert.ok((await manageCustomer(id, "block")).blockedAt);
  assert.deepEqual(removed, []);
  assert.equal(await shouldIgnoreInbound(incoming), true);
  assert.equal(await shouldIgnoreInbound({ ...incoming, phoneNumberId: "different-sender" }), false);
  await assert.rejects(sendTextMessage(reply), { statusCode: 403 });
  assert.equal(outbound.mock.callCount(), 0);

  assert.equal((await manageCustomer(id, "unblock")).blockedAt, null);
  assert.equal(await shouldIgnoreInbound(incoming), false);
  await sendTextMessage(reply);
  assert.equal(outbound.mock.callCount(), 1);

  await manageCustomer(id, "block");
  await manageCustomer(id, "delete");
  assert.deepEqual(removed, ["messages", "greeting", "conversation"]);
  assert.equal(await shouldIgnoreInbound({ ...incoming, timestamp: saved.deletedThrough }), false);
  assert.equal(await shouldIgnoreInbound({ ...incoming, timestamp: saved.deletedThrough, messageId: "deleted-message-id" }), true);
  assert.equal(await shouldIgnoreInbound({ ...incoming, timestamp: new Date(+saved.deletedThrough - 1000) }), true);
  await assert.rejects(manageCustomer(id, "delete"), { statusCode: 404 });
});
