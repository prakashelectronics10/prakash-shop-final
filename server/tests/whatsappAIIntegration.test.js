const test = require("node:test");
const assert = require("node:assert/strict");
process.env.GEMINI_API_KEY = "unit-test-key";
process.env.GEMINI_MODEL = "gemini-3.5-flash";

function query(value) {
  return { select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value };
}

test("captionless images reach vision, voice transcripts reach chat/history, and human takeover skips media", async (t) => {
  const conversation = { _id: "66b000000000000000000002", account: "66b000000000000000000003", customerWaId: "919876543210", conversationMemory: {}, async save() {} };
  const account = { _id: conversation.account, accessToken: "secret", phoneNumberId: "123" };
  for (const model of ["Offer", "ShopProduct", "ProjectPart"]) {
    t.mock.method(require(`../models/${model}`), "find", () => query([]));
  }
  t.mock.method(require("../services/pulseAIKnowledgeService"), "getPulseAIKnowledge", async () => ({}));
  t.mock.method(require("../models/WhatsAppAISettings"), "findOneAndUpdate", async () => ({ enabled: true }));
  t.mock.method(require("../models/WhatsAppConversation"), "findById", async () => conversation);
  const Messages = require("../models/WhatsAppMessage");
  t.mock.method(Messages, "find", () => query([]));
  let storedTranscript;
  let transcriptStorageAvailable = true;
  t.mock.method(Messages, "findOneAndUpdate", async (_filter, update) => {
    if (!transcriptStorageAvailable) throw new Error("Temporary write failure");
    storedTranscript = update.$set.text;
    return null;
  });
  const sends = [];
  t.mock.method(require("../services/whatsappCloudApiService"), "sendTextMessage", async (args) => { sends.push(args.text); return { messages: [{ id: "outbound" }] }; });
  const interactive = t.mock.method(require("../services/whatsappCloudApiService"), "sendInteractiveMessage", async () => {
    throw Object.assign(new Error("Meta rejected parameters"), { status: 400, payload: { error: { code: 131009 } } });
  });
  t.mock.method(require("../services/whatsappConversationService"), "recordMessage", async (args) => args);
  t.mock.method(require("../services/whatsappRealtimeService"), "publishConversationUpsert", () => {});
  let mode = "image";
  let audioResponseUnavailable = false;
  const modelRequests = [];
  const fetchMock = t.mock.method(global, "fetch", async (url, opts) => {
    if (String(url).startsWith("https://graph.facebook.com")) return Response.json({ mime_type: `${mode}/${mode === "audio" ? "ogg" : "jpeg"}`, url: "https://lookaside.fbsbx.com/file", file_size: 5 });
    if (String(url).startsWith("https://lookaside")) return new Response(Buffer.from("media"));
    const body = JSON.parse(opts.body);
    modelRequests.push(body);
    const transcriptRequest = body.systemInstruction.parts[0].text.startsWith("Transcribe");
    if (transcriptRequest && audioResponseUnavailable) return Response.json({}, { status: 503 });
    return Response.json({ candidates: [{ content: { parts: [{ text: transcriptRequest ? "Is bulb ka price kya hai?" : "Product details batayein, main help karunga." }] } }] });
  });
  const { maybeReplyWithAI, generateWhatsAppAIReply } = require("../services/whatsappAIService");
  await maybeReplyWithAI({ account, conversation, customerMessage: "", media: { id: "1234", type: "image", messageId: "image" } });
  const imageParts = modelRequests[0].contents.at(-1).parts;
  assert.equal(imageParts[1].inlineData.mimeType, "image/jpeg");
  assert.equal(imageParts[1].inlineData.data, Buffer.from("media").toString("base64"));
  assert.match(sends[0], /Product details/);
  mode = "audio";
  await maybeReplyWithAI({ account, conversation, customerMessage: "", media: { id: "5678", type: "audio", messageId: "audio" } });
  assert.equal(storedTranscript, "Is bulb ka price kya hai?");
  assert.equal(modelRequests.at(-1).contents.at(-1).parts[0].text, storedTranscript);
  assert.equal(modelRequests.at(-1).contents.at(-1).parts.length, 1);
  transcriptStorageAvailable = false;
  await maybeReplyWithAI({ account, conversation, media: { id: "5678", type: "audio", messageId: "audio-2" } });
  assert.match(sends.at(-1), /Product details/);
  audioResponseUnavailable = true;
  await maybeReplyWithAI({ account, conversation, media: { id: "5678", type: "audio", messageId: "audio-3" } });
  assert.match(sends.at(-1), /Abhi voice note process nahi ho paya/);
  const count = fetchMock.mock.callCount();
  conversation.humanTakeover = true;
  assert.equal((await maybeReplyWithAI({ account, conversation, media: { id: "1234", type: "image" } })).reason, "human_takeover");
  assert.equal(fetchMock.mock.callCount(), count);

  // Nested checkout data must survive parsing, while machine metadata stays out of customer text.
  conversation.humanTakeover = false;
  t.mock.method(global, "fetch", async () => Response.json({ candidates: [{ content: { parts: [{ text: 'Details mil gayi.\nWHATSAPP_ORDER: {"customer":{"name":"Test","pincode":"834001"},"items":[{"sourceType":"shop-product","sourceId":"66b000000000000000000001","quantity":2}]}' }] } }] }));
  const result = await generateWhatsAppAIReply({ account, conversation, customerMessage: "buy", settings: {} });
  assert.equal(result.checkoutPatch.customer.name, "Test");
  assert.equal(result.checkoutPatch.items[0].quantity, 2);
  assert.equal(result.text, "Details mil gayi.");

  const models = [];
  t.mock.method(global, "fetch", async (url) => {
    const model = new URL(url).pathname.split("/").at(-1).split(":")[0];
    models.push(model);
    if (model === "gemini-3.5-flash") {
      return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
    }
    return Response.json({ candidates: [{ content: { parts: [
      { text: "Here are the products.\nWHATSAPP_BUTTONS: [{\"type\":\"url\",\"label\":\"Shop\",\"url\":\"https://prakashshop.in/products\"}]" },
    ] } }] });
  });
  await maybeReplyWithAI({ account, conversation, customerMessage: "products" });
  assert.deepEqual(models, ["gemini-3.5-flash", "gemini-3.5-flash-lite"]);
  assert.equal(interactive.mock.callCount(), 1);
  assert.deepEqual(sends.slice(-2), ["Here are the products.", "Shop: https://prakashshop.in/products"]);

  await generateWhatsAppAIReply({ account, conversation, customerMessage: "products", settings: {} });
  assert.deepEqual(models, ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite"]);
});
