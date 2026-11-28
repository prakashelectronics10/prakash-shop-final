const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const env = require("../config/env");
const { createGeminiConfirmation, createUsageTracker, createVoiceRuntime } = require("../services/whatsappVoiceAudio");
const { createConfirmation, createVoiceTools } = require("../services/whatsappVoiceTools");
const { callProvider, estimatedCost, resolveVoiceModel } = require("../services/whatsappVoiceModels");
const { configurationReady } = require("../services/whatsappVoiceService");

const call = { provider: "gemini", model: "gemini-3.8-live", voice: "Kore" };

test("Gemini is ready with only Google's key; legacy OpenAI settings and call history remain readable", (t) => {
  const config = env.pulseVoice;
  const restore = { ...config, mongoUri: env.mongoUri, appSecret: env.metaApp.appSecret, whatsAppEnabled: env.whatsapp.enabled };
  const { mongoUri, appSecret, whatsAppEnabled, ...voiceConfig } = restore;
  t.after(() => {
    Object.assign(config, voiceConfig);
    env.mongoUri = mongoUri;
    env.metaApp.appSecret = appSecret;
    env.whatsapp.enabled = whatsAppEnabled;
  });
  Object.assign(config, {
    googleKey: "placeholder", openaiKey: "", provider: "gemini", geminiModel: call.model,
    phoneNumberId: "placeholder", businessAccountId: "placeholder", accessToken: "placeholder",
    livekitUrl: "placeholder", livekitKey: "placeholder", livekitSecret: "placeholder",
  });
  env.mongoUri = "mongodb://placeholder";
  env.metaApp.appSecret = "placeholder";
  env.whatsapp.enabled = true;
  assert.equal(configurationReady(), true);
  assert.deepEqual(resolveVoiceModel(config, { model: "gpt-realtime-2.1", voice: "marin" }), call);
  assert.equal(callProvider({ model: "gpt-realtime-2.1" }), "openai");
  config.googleKey = "";
  config.openaiKey = "placeholder";
  assert.equal(configurationReady(), false);
  config.provider = "openai";
  config.openaiModel = "gpt-realtime-2.1";
  assert.equal(configurationReady(), true);
  assert.deepEqual(resolveVoiceModel(config, { model: "gpt-realtime-2.1-mini", voice: "cedar" }), {
    provider: "openai", model: "gpt-realtime-2.1-mini", voice: "cedar",
  });
});

test("Gemini confirmations reject partial, stale and interrupted transcripts", () => {
  const consent = createConfirmation();
  const adapter = createGeminiConfirmation(consent);
  const start = (at) => adapter.onSpeechBoundary({ newState: "speaking", speechTimestamp: at });
  const end = (at) => adapter.onSpeechBoundary({ newState: "listening", speechTimestamp: at });
  const text = (id, isFinal, transcript, turnStartedAt) =>
    adapter.onTranscript({ itemId: id, isFinal, transcript, turnStartedAt });
  const phrase = "Confirm the order and message me";
  const earlier = Date.now() - 100;
  start(earlier);
  text("earlier", false, phrase);
  end(earlier + 20);
  consent.arm("order");
  text("earlier", true, phrase, earlier + 10);
  assert.equal(consent.get("order"), null);
  const later = Date.now() + 10;
  start(later);
  text("partial", false, phrase);
  assert.equal(consent.get("order"), null);
  // The next caller utterance clears the preceding utterance's authorization.
  start(later + 10);
  end(later + 25);
  text("partial", true, phrase, later + 5);
  assert.equal(consent.get("order"), null);
  text("next", false, phrase);
  text("next", true, phrase, later + 20);
  assert.equal(consent.get("order").message, true);
  start(later + 30);
  assert.equal(consent.get("order"), null);
});

test("Gemini estimates text, audio, tool and thought usage without counting repeated response metrics twice", () => {
  const usage = createUsageTracker("gemini");
  const metrics = {
    requestId: "same-response", inputTokens: 420, outputTokens: 80, reasoningTokens: 15, totalTokens: 535,
    inputTokenDetails: { textTokens: 120, audioTokens: 300 },
    outputTokenDetails: { textTokens: 20, audioTokens: 60 },
  };
  usage.record(metrics);
  usage.record(metrics);
  assert.deepEqual(usage.totals(), {
    inputText: 140, cachedText: 0, inputAudio: 300, cachedAudio: 0,
    outputText: 35, outputAudio: 60, unclassifiedTokens: 0,
  });
  const usd = (140 * 0.75 + 300 * 3 + 35 * 4.5 + 60 * 12) / 1_000_000;
  assert.equal(estimatedCost({ ...call, usage: usage.totals() }), usd);
  usage.record({ requestId: "missing-modalities", inputTokens: 10 });
  assert.equal(usage.totals().unclassifiedTokens, 10);
  assert.equal(estimatedCost({ ...call, usage: usage.totals() }), null);
});

test("official Gemini plugin sets up all Pulse tools and streams audio in both directions over a mocked connection",
  { timeout: 15_000 }, async (t) => {
    const [{ inference, llm, initializeLogger }, { Live }, { AudioFrame }] = await Promise.all([
      import("@livekit/agents"), import("@google/genai"), import("@livekit/rtc-node"),
    ]);
    initializeLogger({ pretty: false, level: "fatal" });
    let connectArgs;
    const sent = [];
    t.mock.method(Live.prototype, "connect", async (args) => {
      connectArgs = args;
      args.callbacks.onopen();
      return {
        sendClientContent(params) { sent.push(["content", params]); },
        sendRealtimeInput(params) { sent.push(["input", params]); },
        close() {},
      };
    });
    const consent = createConfirmation();
    const runtime = await createVoiceRuntime(call, { googleKey: "fake-key", openaiKey: "" }, consent, inference);
    assert.ok(runtime.llm instanceof llm.RealtimeModel);
    assert.ok(runtime.vad instanceof inference.VAD);
    const tools = createVoiceTools({ call: { _id: "mock" }, consent, endCall: () => false });
    const context = new llm.ToolContext(Object.entries(tools)
      .map(([name, definition]) => llm.tool({ name, ...definition })));
    const realtime = runtime.llm.session({ instructions: "Pulse AI", tools: context });
    t.after(() => runtime.llm.close());
    const reply = realtime.generateReply("Greet the caller, then listen.");
    await waitFor(() => sent.some(([type]) => type === "content"));
    assert.equal(connectArgs.model, call.model);
    assert.equal(connectArgs.config.systemInstruction.parts[0].text, "Pulse AI");
    assert.equal(connectArgs.config.realtimeInputConfig.activityHandling, "START_OF_ACTIVITY_INTERRUPTS");
    assert.equal(connectArgs.config.responseModalities[0], "AUDIO");
    const declarations = connectArgs.config.tools[0].functionDeclarations;
    assert.equal(declarations.length, Object.keys(tools).length);
    const order = declarations.find((tool) => tool.name === "review_order").parameters;
    assert.deepEqual(order.properties.method.enum, ["online", "cod"]);
    assert.ok(order.properties.items.items.required.includes("quantity"));
    const repair = declarations.find((tool) => tool.name === "review_repair").parameters;
    assert.deepEqual(repair.properties.customerEmail, { type: "string" });
    assert.ok(!repair.required?.includes("customerEmail"));
    assert.ok(declarations.some((tool) => tool.name === "end_call"));
    assert.equal(declarations.find((tool) => tool.name === "submit_order").parameters, undefined);
    connectArgs.callbacks.onmessage({ serverContent: { modelTurn: { parts: [
      { inlineData: { data: Buffer.alloc(960).toString("base64") } },
    ] } } });
    const { messageStream } = await reply;
    const { value: message } = await messageStream.getReader().read();
    const { value: audio } = await message.audioStream.getReader().read();
    assert.equal(audio.sampleRate, 24000);
    realtime.pushAudio(new AudioFrame(new Int16Array(3200), 16000, 1, 3200));
    await waitFor(() => sent.some(([type, params]) => type === "input" && params.audio?.data));
    const bargeIn = once(realtime, "input_speech_started");
    connectArgs.callbacks.onmessage({ serverContent: { interrupted: true } });
    await bargeIn;
  });

async function waitFor(predicate) {
  for (let attempts = 0; attempts < 80; attempts += 1) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail("Gemini SDK did not produce the expected mock event");
}
