const test = require("node:test");
const assert = require("node:assert/strict");
const { requestGeminiWithRetry } = require("../services/geminiClient");

function response(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
  };
}

test("retries a temporary high-demand response before succeeding", async () => {
  const statuses = [503, 200];
  const waits = [];
  const result = await requestGeminiWithRetry({
    apiKey: "test-key",
    models: ["gemini-3.5-flash"],
    requestBody: "{}",
    fetchImpl: async () => response(statuses.shift(), { error: { message: "high demand" } }),
    waitImpl: async (delay) => waits.push(delay),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.attempts, 2);
  assert.equal(waits.length, 1);
});

test("moves to a supported backup model after repeated transient failures", async () => {
  const urls = [];
  const result = await requestGeminiWithRetry({
    apiKey: "test-key",
    models: ["gemini-3.5-flash", "gemini-3.5-flash-lite"],
    requestBody: "{}",
    fetchImpl: async (url) => {
      urls.push(url);
      return url.includes("gemini-3.5-flash-lite")
        ? response(200)
        : response(503, { error: { message: "high demand" } });
    },
    waitImpl: async () => {},
  });
  assert.equal(result.usedModel, "gemini-3.5-flash-lite");
  assert.equal(result.response.status, 200);
  assert.equal(urls.length, 3);
});

test("does not retry authentication or malformed-request failures", async () => {
  let calls = 0;
  const result = await requestGeminiWithRetry({
    apiKey: "bad-key",
    models: ["gemini-3.5-flash", "gemini-3.5-flash-lite"],
    requestBody: "{}",
    fetchImpl: async () => {
      calls += 1;
      return response(403, { error: { message: "permission denied" } });
    },
    waitImpl: async () => {},
  });
  assert.equal(calls, 1);
  assert.equal(result.error.status, 403);
});

test("a stalled Gemini response body still leaves time for the backup model", async () => {
  const result = await requestGeminiWithRetry({
    apiKey: "test-key",
    models: ["primary", "backup"],
    requestBody: "{}",
    attemptsPerModel: 1,
    attemptTimeoutMs: 10,
    totalTimeoutMs: 1000,
    readResponseBody: true,
    fetchImpl: async (url, { signal }) => {
      if (url.includes("/models/backup:")) return response(200, { reply: "ready" });
      return {
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      };
    },
  });
  assert.equal(result.usedModel, "backup");
  assert.deepEqual(result.data, { reply: "ready" });
});
