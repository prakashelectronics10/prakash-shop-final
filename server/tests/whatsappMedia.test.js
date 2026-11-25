const test = require("node:test");
const assert = require("node:assert/strict");
process.env.GEMINI_API_KEY = "unit-test-key";
process.env.GEMINI_MODEL = "gemini-3.5-flash";
const { downloadInboundMedia, transcribeAudio, safeMediaUrl, MAX_BYTES } = require("../services/whatsappMediaService");
const { parseInboundWebhook } = require("../services/whatsappCloudApiService");

test("captionless image and voice webhook retain media IDs and audio MIME", () => {
  const events = parseInboundWebhook({ entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "123" }, messages: [
      { id: "image-1", from: "919876543210", type: "image", image: { id: "1234", mime_type: "image/jpeg" } },
      { id: "voice-1", from: "919876543210", type: "audio", audio: { id: "5678", mime_type: "audio/ogg; codecs=opus", voice: true } },
    ],
  } }] }] });
  assert.equal(events[0].text, "");
  assert.equal(events[0].mediaId, "1234");
  assert.equal(events[1].type, "audio");
  assert.equal(events[1].mediaMimeType, "audio/ogg; codecs=opus");
});

test("media download authenticates both requests and passes real bytes to Gemini", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (calls.length === 1) return Response.json({ mime_type: "audio/ogg; codecs=opus", file_size: 5, url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/123" });
    if (calls.length === 2) return new Response(Buffer.from("voice"));
    const body = JSON.parse(opts.body);
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, "audio/opus");
    assert.equal(body.contents[0].parts[0].inlineData.data, Buffer.from("voice").toString("base64"));
    return Response.json({ candidates: [{ content: { parts: [{ text: "Mujhe ek lamp chahiye" }] } }] });
  });
  const media = await downloadInboundMedia({ account: { accessToken: "secret", phoneNumberId: "123" }, mediaId: "5678", type: "audio" });
  assert.equal(await transcribeAudio(media), "Mujhe ek lamp chahiye");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer secret");
  assert.equal(calls[1].opts.headers.Authorization, "Bearer secret");
  assert.equal(calls[1].opts.redirect, "error");
});

test("voice download recovers Opus from the webhook MIME or the Ogg header", async (t) => {
  const oggOpus = Buffer.alloc(64);
  oggOpus.write("OggS");
  oggOpus.write("OpusHead", 28);
  const account = { accessToken: "secret", phoneNumberId: "123" };
  let metadataMime = "audio/ogg";
  t.mock.method(global, "fetch", async (url) => String(url).startsWith("https://graph.facebook.com")
    ? Response.json({ mime_type: metadataMime, url: "https://lookaside.fbsbx.com/file" })
    : new Response(oggOpus));
  const media = await downloadInboundMedia({ account, mediaId: "123", type: "audio" });
  assert.deepEqual(media.inlineData, { mimeType: "audio/opus", data: oggOpus.toString("base64") });
  metadataMime = "application/octet-stream";
  const fromWebhook = await downloadInboundMedia({ account, mediaId: "123", type: "audio", mimeType: 'audio/ogg; codecs="opus"' });
  assert.deepEqual(fromWebhook, media);
});

test("transcription retries a rejected Opus MIME and falls back after an incomplete response", async (t) => {
  const data = Buffer.from("voice").toString("base64");
  const requests = [];
  t.mock.method(global, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    const audio = body.contents[0].parts[0].inlineData;
    assert.equal(audio.data, data);
    requests.push({ url, mimeType: audio.mimeType });
    if (requests.length === 1) return Response.json({ error: { status: "INVALID_ARGUMENT" } }, { status: 400 });
    if (requests.length === 2) return Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Incomplete" }] } }] });
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { thought: true, text: "Internal thought" },
      { text: "Mujhe ek [INAUDIBLE] chahiye" },
    ] } }] });
  });
  assert.equal(await transcribeAudio({ inlineData: { mimeType: "audio/opus", data } }), "Mujhe ek [INAUDIBLE] chahiye");
  assert.deepEqual(requests.map(({ mimeType }) => mimeType), ["audio/opus", "audio/ogg", "audio/ogg"]);
  assert.match(requests[2].url, /gemini-3\.5-flash-lite:generateContent/);
});

test("an entirely inaudible voice note is distinct from provider failure", async (t) => {
  const part = { inlineData: { mimeType: "audio/opus", data: "dm9pY2U=" } };
  const mock = t.mock.method(global, "fetch", async () => Response.json({ candidates: [
    { finishReason: "STOP", content: { parts: [{ text: "[INAUDIBLE]" }] } },
  ] }));
  await assert.rejects(transcribeAudio(part), { code: "voice_unclear" });
  assert.equal(mock.mock.callCount(), 1);
  mock.mock.mockImplementation(async () => Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }));
  await assert.rejects(transcribeAudio(part), { code: "transcription_unavailable", status: 503 });
});

test("untrusted URLs, unsupported formats and oversized media fail closed", async (t) => {
  for (const url of ["http://facebook.com/file", "https://facebook.com.evil.test/file", "https://127.0.0.1/file", "https://user:pass@facebook.com/file"]) {
    assert.throws(() => safeMediaUrl(url));
  }
  t.mock.method(global, "fetch", async () => Response.json({ mime_type: "image/jpeg", file_size: MAX_BYTES + 1, url: "https://lookaside.fbsbx.com/file" }));
  await assert.rejects(downloadInboundMedia({ account: {}, mediaId: "1234", type: "image" }), /12 MB/);
});
