const test = require("node:test");
const assert = require("node:assert/strict");
const env = require("../config/env");
const { chatWithScienceAI } = require("../controllers/scienceAIController");

function runChat(body) {
  const events = [];
  const req = { body, get: (name) => name === "accept" ? "application/x-ndjson" : "" };
  return new Promise((resolve, reject) => {
    const res = {
      headersSent: false,
      set() {},
      write(line) {
        this.headersSent = true;
        events.push(JSON.parse(line));
      },
      end(line) {
        this.write(line);
        resolve(events);
      },
    };
    chatWithScienceAI(req, res, reject);
  });
}

test("a quota-limited follow-up still answers and skips the cooling model on the next turn", async (t) => {
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "test-key";
  t.after(() => { env.geminiApiKey = originalKey; });
  const models = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const model = /models\/([^:]+)/.exec(url)[1];
    models.push(model);
    const { contents } = JSON.parse(options.body);
    if (models.length === 1) {
      assert.deepEqual(contents.map(({ role }) => role), ["user"]);
      return Response.json({ candidates: [{ content: { parts: [{ text: "How can I help?" }] } }] });
    }
    assert.deepEqual(contents.map(({ role }) => role), ["user", "model", "user"]);
    if (models.length === 2) {
      return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
    }
    return Response.json({}, { status: 404 });
  });

  const first = (await runChat({ message: "Hello" })).at(-1);
  assert.equal(first.payload.data.response, "How can I help?");

  const followUp = {
    message: "products",
    conversationHistory: [
      ...first.payload.data.conversationHistory,
      null,
      { role: "ai", text: "" },
    ],
  };
  const second = (await runChat(followUp)).at(-1);
  assert.equal(second.type, "result");
  assert.equal(second.payload.data.model, "local-fallback");
  assert.match(second.payload.data.response, /browse the shop catalog/);
  assert.equal(second.payload.data.linkCards[0].url, "/products");
  assert.equal(models.filter((model) => model === models[0]).length, 2);

  const firstModel = models[0];
  models.length = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    models.push(/models\/([^:]+)/.exec(url)[1]);
    return Response.json({ candidates: [] });
  });
  const third = (await runChat(followUp)).at(-1);
  assert.ok(models.length > 0);
  assert.ok(!models.includes(firstModel));
  assert.equal(third.payload.data.model, "local-fallback");
});

test("returns verified chips for multiline metadata and links embedded in the reply", async (t) => {
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "test-key";
  t.after(() => { env.geminiApiKey = originalKey; });
  const replies = [
    [
      "Here is the shop catalog.",
      "**WEBSITE_LINKS:**",
      "```json",
      '[{"title":"Browse catalog",',
      '"url":"https://www.prakashshop.in/products/"},',
      '{"title":"Unknown site","url":"https://unverified.example.com/"}]',
      "```",
    ].join("\n"),
    "Use [Book Repair](/booking) or go to /contact.",
    "Here you go.",
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json({
    candidates: [{ content: { parts: [{ text: replies.shift() }] } }],
  }));

  const first = (await runChat({ message: "Okay" })).at(-1).payload.data;
  assert.equal(first.response, "Here is the shop catalog.");
  assert.deepEqual(first.linkCards.map(({ url }) => url), ["/products"]);
  const second = (await runChat({ message: "Sure" })).at(-1).payload.data;
  assert.deepEqual(second.linkCards.map(({ url }) => url), ["/booking", "/contact"]);
  const third = (await runChat({
    message: "link bhejo",
    conversationHistory: [{ role: "user", text: "How do I book a repair?" }],
  })).at(-1).payload.data;
  assert.deepEqual(third.linkCards.map(({ url }) => url), ["/booking"]);
});
