const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { EventEmitter } = require("node:events");
const express = require("express");
const env = require("../config/env");
const voice = require("../services/whatsappVoiceService");
const { bindVoiceSession, createGeminiConfirmation, createOpenAIRealtime, createUsageTracker } = require("../services/whatsappVoiceAudio");
const { createConfirmation, createVoiceTools } = require("../services/whatsappVoiceTools");
const { handleWhatsAppWebhook, verifyWhatsAppWebhook } = require("../controllers/whatsappWebhookController");

const config = { phoneNumberId: "123456", businessAccountId: "234567" };
const from = "919876543210";
const now = () => String(Math.floor(Date.now() / 1000));
const offer = (id = "wacid.example", phone = from) => ({
  id, event: "connect", from: phone, timestamp: now(), direction: "USER_INITIATED",
  session: { sdp_type: "offer", sdp: "v=0\r\n" },
});
const terminate = (id = "wacid.example") => ({ id, event: "terminate", from, direction: "USER_INITIATED", status: "COMPLETED", duration: 12 });
const payload = (...calls) => ({
  object: "whatsapp_business_account",
  entry: [{ id: config.businessAccountId, changes: [{ field: "calls",
    value: { metadata: { phone_number_id: config.phoneNumberId }, calls } }] }],
});

function store() {
  const rows = new Map();
  const equal = (left, right) => left instanceof Date && right instanceof Date ? +left === +right : left === right;
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (value?.$in) return value.$in.includes(row[key]);
    if (value?.$lte) return row[key] <= value.$lte;
    if (value?.$ne) return !equal(row[key], value.$ne);
    if (typeof value?.$exists === "boolean") return Object.hasOwn(row, key) === value.$exists;
    return equal(row[key], value);
  });
  const query = (value) => ({
    lean: async () => structuredClone(value),
    limit: () => query(value),
    select: () => query(value),
    sort: () => query([...value].sort((a, b) => b.slot - a.slot)),
  });
  const find = (filter) => [...rows.values()].filter((row) => matches(row, filter));
  const mutate = (row, update) => {
    Object.assign(row, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete row[key];
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
  };
  return {
    rows,
    async create(data) {
      if (rows.has(data._id) || (data.slot != null && find({ slot: data.slot }).length)) {
        throw Object.assign(new Error("duplicate"), { code: 11000 });
      }
      rows.set(data._id, structuredClone(data));
      return structuredClone(data);
    },
    findById: (id) => query(rows.get(id)),
    findOne: (filter) => query(find(filter)[0]),
    find: (filter) => query(find(filter)),
    exists: async (filter) => Boolean(find(filter).length),
    async updateOne(filter, update) {
      const row = find(filter)[0];
      if (row) mutate(row, update);
      return { modifiedCount: row ? 1 : 0 };
    },
    findOneAndUpdate(filter, update) {
      const row = find(filter)[0];
      if (row) mutate(row, update);
      return query(row);
    },
  };
}

function fixture({ maxConcurrent = 1, enabled = true, acceptError } = {}) {
  const calls = store();
  const signals = [];
  const life = voice.createVoiceService({ calls, config,
    loadSettings: async () => ({ enabled, maxConcurrent, provider: "gemini", model: "gemini-3.8-live", voice: "Kore", greeting: "Namaste", languages: ["hi"] }),
    transport: {
      accept: async (call, sdp) => {
        signals.push(["accept", call._id, sdp, call.roomName]);
        if (acceptError) throw acceptError;
      },
      reject: async (call) => signals.push(["reject", call._id]),
      disconnect: async (call, byMeta) => signals.push(["disconnect", call._id, byMeta]),
    },
  });
  const receive = async (...events) => {
    const work = await Promise.all(voice.parseCallEvents(payload(...events)).map(life.receive));
    await Promise.all(work.filter(Boolean).map((run) => run()));
  };
  return { ...life, receive, calls, signals };
}

test("Meta payload only routes inbound offers and extracts the documented BSUID and terminate fields", () => {
  const body = payload(offer(), { ...offer("out"), direction: "BUSINESS_INITIATED" },
    { ...offer("answer"), session: { sdp_type: "answer", sdp: "v=0" } },
    { ...offer("scoped"), from: undefined, from_user_id: "IN.ABC123" },
    { ...terminate(), status: "FAILED", errors: [{ code: 138001, message: "private detail" }] });
  const events = voice.parseCallEvents(body);
  assert.deepEqual(events.map((event) => event.id), ["wacid.example", "scoped", "wacid.example"]);
  assert.equal(events[1].caller, "IN.ABC123");
  assert.equal(events[2].errorCode, "meta_138001");
  assert.equal(events[2].duration, 12);
  assert.equal(events[2].failed, true);
  assert.deepEqual(voice.parseCallEvents({ object: "whatsapp_business_account", entry: [null] }), []);
});

test("valid HMAC reaches the calling path while modified bytes fail and the Meta challenge still works", async (t) => {
  t.mock.method(voice, "configurationReady", () => true);
  t.mock.method(voice, "ensureIndexes", async () => {});
  const delivered = [];
  t.mock.method(voice, "receive", async (event) => async () => { delivered.push(event); });
  const { enabled, webhookVerifyToken } = env.whatsapp;
  const voiceEnabled = env.pulseVoice.enabled;
  const secret = env.metaApp.appSecret;
  Object.assign(env.whatsapp, { enabled: true, webhookVerifyToken: "test-verify" });
  env.metaApp.appSecret = "voice-test-secret";
  env.pulseVoice.enabled = true;
  t.after(() => {
    Object.assign(env.whatsapp, { enabled, webhookVerifyToken });
    env.metaApp.appSecret = secret;
    env.pulseVoice.enabled = voiceEnabled;
  });
  const app = express();
  app.get("/whatsapp/webhook", verifyWhatsAppWebhook);
  app.post("/whatsapp/webhook", express.raw({ type: "application/json" }), handleWhatsAppWebhook);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => { server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/whatsapp/webhook`;
  const raw = JSON.stringify(payload(offer()));
  const signature = "sha256=" + createHmac("sha256", env.metaApp.appSecret).update(raw).digest("hex");
  const headers = { "Content-Type": "application/json", "x-hub-signature-256": signature };
  assert.equal((await fetch(url, { method: "POST", headers, body: raw + " " })).status, 403);
  assert.equal(delivered.length, 0);
  assert.equal((await fetch(url, { method: "POST", headers, body: raw })).status, 200);
  assert.equal(delivered[0].id, "wacid.example");
  assert.equal(await (await fetch(url + "?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123")).text(), "123");
});

test("duplicate and concurrent offers reserve separate rooms, enforce capacity and release on signed hang-up", async () => {
  const { receive, calls, signals } = fixture({ maxConcurrent: 2 });
  await receive(offer("first"), offer("first"), offer("second", "918765432109"), offer("third"));
  assert.equal(signals.filter(([signal, id]) => signal === "accept" && id === "first").length, 1);
  assert.equal(calls.rows.get("first").provider, "gemini");
  assert.equal(signals.filter(([signal]) => signal === "accept").length, 2);
  assert.equal(new Set(signals.filter(([signal]) => signal === "accept").map((entry) => entry[3])).size, 2);
  assert.equal(calls.rows.get("third").state, "missed");
  assert.deepEqual(signals.find(([signal]) => signal === "reject"), ["reject", "third"]);
  await receive(terminate("first"), terminate("first"));
  assert.equal(calls.rows.get("first").state, "completed");
  assert.equal(calls.rows.get("first").durationSeconds, 12);
  assert.equal(signals.filter(([signal]) => signal === "disconnect").length, 1);
  assert.deepEqual(signals.find(([signal]) => signal === "disconnect"), ["disconnect", "first", true]);
  await receive(offer("fourth"));
  assert.equal(calls.rows.get("fourth").state, "incoming");
});

test("reconciles expired calls and connector errors, rejects disabled calls and handles terminate-before-connect", async () => {
  const failed = fixture({ acceptError: new Error("private SDP") });
  await failed.receive(offer());
  assert.equal(failed.calls.rows.get("wacid.example").errorCode, "connector_accept");
  assert.equal(failed.calls.rows.get("wacid.example").slot, undefined);
  assert.deepEqual(failed.signals.at(-1), ["disconnect", "wacid.example", false]);
  const life = fixture();
  await life.receive({ ...terminate("late"), duration: undefined });
  await life.receive(offer("late"), offer("expire"));
  assert.equal(life.calls.rows.get("late").state, "missed");
  life.calls.rows.get("expire").deadline = new Date(0);
  await life.expire();
  assert.equal(life.calls.rows.get("expire").errorCode, "connection_timeout");
  const disabled = fixture({ enabled: false });
  await disabled.receive(offer());
  assert.deepEqual(disabled.signals, [["reject", "wacid.example"]]);
});

function speech(consent, transcript, itemId = "turn") {
  consent.speechStarted(Date.now() + 1, itemId);
  consent.transcript({ isFinal: true, itemId, transcript });
}

function geminiSpeech(adapter, transcript, itemId = "turn") {
  const beganAt = Date.now() + 1;
  adapter.onSpeechBoundary({ newState: "speaking", speechTimestamp: beganAt });
  adapter.onTranscript({ itemId, transcript, isFinal: false });
  adapter.onSpeechBoundary({ newState: "listening", speechTimestamp: beganAt + 1 });
  adapter.onTranscript({ itemId, transcript, isFinal: true, turnStartedAt: beganAt + 1 });
}

const repairDetails = { fullName: "Test Person", phoneNumber: "9876543210", device: "TV", brand: "Brand",
  problem: "No picture", address: "12 Main Road", pincode: "825101" };
const orderDetails = { method: "online", customer: { name: "Test Person", phone: "9876543210",
  address: "12 Main Road", pincode: "825101" },
  items: [{ sourceType: "shop-product", sourceId: "1234567890abcdef12345678", quantity: 2 }] };

test("repair requires a new explicit utterance, records one booking, and only sends a template on request", async () => {
  const consent = createConfirmation();
  const adapter = createGeminiConfirmation(consent);
  let created = 0;
  let sent = 0;
  const tools = createVoiceTools({ call: { _id: "first", phone: from }, account: { _id: "shop" }, consent, services: {
    Call: { exists: async () => true },
    createRepairBooking: async ({ data, source }) => {
      assert.equal(data.whatsappNumber, from);
      assert.equal(data.repairType, "TV Brand");
      assert.equal(source, "whatsapp-voice");
      created++;
      return { _id: "booking" };
    },
    sendBookingConfirmationWhatsApp: async ({ templateOnly }) => {
      assert.equal(templateOnly, true);
      sent++;
      return { ok: true };
    },
  } });
  geminiSpeech(adapter, "Confirm the repair and message me", "early");
  assert.equal((await tools.review_repair.execute(repairDetails)).status, "awaiting_confirmation");
  assert.equal((await tools.submit_repair.execute({})).status, "awaiting_confirmation");
  geminiSpeech(adapter, "Don't confirm the repair");
  assert.equal((await tools.submit_repair.execute({})).status, "awaiting_confirmation");
  geminiSpeech(adapter, "रिपेयर बुकिंग कंफर्म कीजिए और व्हाट्सएप पर भेजिए।", "approved");
  const [first, second] = await Promise.all([tools.submit_repair.execute({}), tools.submit_repair.execute({})]);
  assert.deepEqual(first, { status: "booked", reference: "booking", whatsappRequested: true, whatsappAccepted: true });
  assert.deepEqual(first, second);
  assert.equal(created, 1);
  assert.equal(sent, 1);
});

test("online checkout stays unconfirmed, passes the exact draft to the shared Razorpay flow, and isolates callers", async () => {
  const updates = [];
  let sends = 0;
  const services = {
    Call: { exists: async () => true },
    getConversation: async (_account, verifiedPhone) => ({ _id: verifiedPhone }),
    previewCheckout: async ({ conversation, patch }) => {
      assert.equal(patch.items[0].quantity, 2);
      conversation.checkout = { token: conversation.voiceCallId };
      return { text: "2 TV cables, delivery charge and total", buttons: [{ payload: `checkout:online:${conversation.voiceCallId}` }] };
    },
    handleCheckoutButton: async ({ conversation, buttonReplyId }) => {
      assert.equal(buttonReplyId, `checkout:online:${conversation.voiceCallId}`);
      assert.equal(conversation.voiceMessaging, true);
      updates.push(conversation.customerWaId);
      conversation.checkout.orderId = "PEABCD234567";
      return { paymentRequestOrderId: "PEABCD234567" };
    },
    sendPaymentRequest: async ({ orderId }) => {
      assert.equal(orderId, "PEABCD234567");
      sends++;
      if (sends === 1) throw new Error("provider timeout");
      return { sent: true };
    },
  };
  const first = createConfirmation();
  const adapter = createGeminiConfirmation(first);
  const second = createConfirmation();
  const caller = (consent, phone, id) => createVoiceTools({ call: { _id: id, phone }, account: { _id: "shop" }, consent, services });
  const a = caller(first, from, "first");
  const b = caller(second, "918765432109", "second");
  await Promise.all([a.review_order.execute(orderDetails), b.review_order.execute(orderDetails)]);
  geminiSpeech(adapter, "Confirm the order");
  assert.equal((await a.submit_order.execute({})).status, "awaiting_confirmation");
  geminiSpeech(adapter, "Order confirm kijiye aur WhatsApp par bhejo", "consent");
  assert.equal((await b.submit_order.execute({})).status, "awaiting_confirmation");
  assert.deepEqual(await a.submit_order.execute({}), { status: "awaiting_payment", reference: "PEABCD234567", whatsappAccepted: false });
  assert.equal((await a.submit_order.execute({})).whatsappAccepted, true);
  assert.deepEqual(updates, [from, from]);
});

test("Realtime uses provider interruption and noise reduction, ignores stale transcript IDs and closes on fatal errors", async () => {
  class Model {
    constructor(options) { this.options = options; }
    session() { return new EventEmitter(); }
  }
  const consent = createConfirmation();
  const model = createOpenAIRealtime({ realtime: { RealtimeModel: Model } }, { model: "gpt-realtime-2.1", voice: "marin" }, "test", consent);
  assert.equal(model.options.turnDetection.interrupt_response, true);
  assert.equal(model.options.turnDetection.type, "semantic_vad");
  assert.equal(model.options.inputAudioNoiseReduction.type, "near_field");
  const realtime = model.session();
  const emit = (type, item_id, transcript) => realtime.emit("openai_server_event_received", { type, item_id, transcript });
  consent.arm("order");
  await new Promise((resolve) => setTimeout(resolve, 5));
  emit("input_audio_buffer.speech_started", "next");
  emit("conversation.item.input_audio_transcription.completed", "previous", "Confirm the order");
  assert.equal(consent.get("order"), null);
  emit("conversation.item.input_audio_transcription.completed", "next", "Confirm the order");
  assert.equal(consent.get("order").kind, "order");
  emit("input_audio_buffer.speech_started", "interruption");
  assert.equal(consent.get("order"), null);
  const session = new EventEmitter();
  const outcomes = [];
  const usage = createUsageTracker("openai");
  bindVoiceSession(session, async (...event) => outcomes.push(event), usage.record);
  session.emit("error", { error: { recoverable: true } });
  session.emit("metrics_collected", { metrics: { type: "realtime_model_metrics", inputTokenDetails: { audioTokens: 8 } } });
  assert.deepEqual(outcomes, []);
  assert.equal(usage.totals().inputAudio, 8);
  session.emit("error", { error: { recoverable: false } });
  session.emit("close", { reason: "error" });
  assert.deepEqual(outcomes, [["failed", "realtime_error"], ["failed", "realtime_closed"]]);
});

test("tool validation, failed execution, and missing caller identity fail without leaking input", async () => {
  const tools = createVoiceTools({ call: { _id: "scoped" }, consent: createConfirmation(), services: {
    searchPublicProducts: async () => { throw new Error("private caller data"); },
  } });
  assert.equal((await tools.search_products.execute({ query: "TV", unsupported: "secret" })).status, "invalid_details");
  const failed = await tools.search_products.execute({ query: "TV" });
  assert.equal(failed.status, "unavailable");
  assert.doesNotMatch(JSON.stringify(failed), /private caller data/);
  assert.equal((await tools.track_order.execute({ reference: "PEABCD234567" })).status, "verified_number_required");
});

test("a discarded draft or a call that has ended cannot submit a repair", async () => {
  const consent = createConfirmation();
  let created = 0;
  const tools = createVoiceTools({ call: { _id: "ended", phone: from }, consent, services: {
    Call: { exists: async () => false },
    createRepairBooking: async () => { created++; },
  } });
  await tools.review_repair.execute(repairDetails);
  speech(consent, "Confirm the repair", "accepted");
  assert.equal((await tools.discard_review.execute({ kind: "repair" })).status, "draft_discarded");
  assert.equal((await tools.submit_repair.execute({})).status, "awaiting_confirmation");
  await tools.review_repair.execute(repairDetails);
  speech(consent, "Confirm the repair", "ended-confirmation");
  assert.equal((await tools.submit_repair.execute({})).status, "unavailable");
  assert.equal(created, 0);
});
