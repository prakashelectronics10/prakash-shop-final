const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const DEFAULT_ATTEMPTS_PER_MODEL = 2;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 30000;
const DEFAULT_TOTAL_TIMEOUT_MS = 55000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(error) {
  const status = Number(error?.status || 0);
  if (RETRYABLE_STATUSES.has(status)) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return status === 0 && (
    message.includes("fetch failed")
    || message.includes("network")
    || message.includes("timeout")
    || message.includes("aborted")
    || message.includes("econnreset")
    || message.includes("etimedout")
    || message.includes("ssl")
    || message.includes("tls")
  );
}

function retryDelayMs(error, retryIndex) {
  const retryAfter = Number(error?.headers?.get?.("retry-after") || error?.headers?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(6000, retryAfter * 1000);
  const exponential = 850 * (2 ** retryIndex);
  const jitter = Math.floor(Math.random() * 350);
  return Math.min(6000, exponential + jitter);
}

async function requestGeminiWithRetry({
  apiKey,
  models,
  requestBody,
  fetchImpl = fetch,
  waitImpl = sleep,
  attemptsPerModel = DEFAULT_ATTEMPTS_PER_MODEL,
  attemptTimeoutMs = DEFAULT_ATTEMPT_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  onRateLimit,
}) {
  const startedAt = Date.now();
  let lastResponse = null;
  let lastError = null;
  let usedModel = models[0] || "";
  let attempts = 0;

  outer: for (const model of models) {
    usedModel = model;
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 750) break outer;

      attempts += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(attemptTimeoutMs, remainingMs));
      try {
        lastResponse = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
            signal: controller.signal,
          },
        );
      } catch (error) {
        lastResponse = null;
        lastError = {
          status: 0,
          message: error?.name === "AbortError" ? "Gemini request timed out." : (error?.message || "Gemini network request failed."),
        };
      } finally {
        clearTimeout(timer);
      }

      if (lastResponse?.ok) {
        return { response: lastResponse, error: null, usedModel, attempts };
      }

      if (lastResponse) {
        const errorData = await lastResponse.json().catch(() => ({}));
        lastError = {
          status: lastResponse.status,
          headers: lastResponse.headers,
          code: errorData.error?.status || errorData.error?.code || "",
          message: errorData.error?.message || `Gemini model ${model} request failed.`,
        };
      }

      if (Number(lastError?.status) === 429) onRateLimit?.(lastError);
      if (Number(lastError?.status) === 404) break;
      if (!isRetryableGeminiError(lastError)) break outer;

      if (attempt < attemptsPerModel - 1) {
        const delay = Math.min(retryDelayMs(lastError, attempt), Math.max(0, remainingMs - 750));
        if (delay > 0) await waitImpl(delay);
      }
    }
  }

  return { response: lastResponse, error: lastError, usedModel, attempts };
}

module.exports = {
  isRetryableGeminiError,
  requestGeminiWithRetry,
  retryDelayMs,
};
