const test = require("node:test");
const assert = require("node:assert/strict");
process.env.GEMINI_API_KEY = "unit-test-key";
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
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, "audio/ogg");
    assert.equal(body.contents[0].parts[0].inlineData.data, Buffer.from("voice").toString("base64"));
    return Response.json({ candidates: [{ content: { parts: [{ text: "Mujhe ek lamp chahiye" }] } }] });
  });
  const media = await downloadInboundMedia({ account: { accessToken: "secret", phoneNumberId: "123" }, mediaId: "5678", type: "audio" });
  assert.equal(await transcribeAudio(media), "Mujhe ek lamp chahiye");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer secret");
  assert.equal(calls[1].opts.headers.Authorization, "Bearer secret");
  assert.equal(calls[1].opts.redirect, "error");
});

test("untrusted URLs, unsupported formats and oversized media fail closed", async (t) => {
  for (const url of ["http://facebook.com/file", "https://facebook.com.evil.test/file", "https://127.0.0.1/file", "https://user:pass@facebook.com/file"]) {
    assert.throws(() => safeMediaUrl(url));
  }
  t.mock.method(global, "fetch", async () => Response.json({ mime_type: "image/jpeg", file_size: MAX_BYTES + 1, url: "https://lookaside.fbsbx.com/file" }));
  await assert.rejects(downloadInboundMedia({ account: {}, mediaId: "1234", type: "image" }), /12 MB/);
});
