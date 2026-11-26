const API_BASE = process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "/api";
const DEFAULT_TIMEOUT = 15000;
const GET_CACHE_TTL = 60 * 1000;
const PROGRESS_CONTENT_TYPE = "application/x-ndjson";
const responseCache = new Map();
const inflightRequests = new Map();

function buildUrl(path) {
  return `${API_BASE}${path}`;
}

export function apiUrl(path) {
  return buildUrl(path);
}

function shouldCache(method, options) {
  return method === "GET" && options.cache !== "no-store";
}

function getCached(key) {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return cached.payload;
}

async function readProgressResponse(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let receivedResult = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop();
      if (done && pending.trim()) lines.push(pending);
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "progress") onProgress(event.stage);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "result") {
          receivedResult = true;
          return event.payload;
        }
      }
      if (done) throw new Error("Connection closed before the reply was received.");
    }
  } finally {
    if (!receivedResult) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const method = String(options.method || "GET").toUpperCase();
  const url = buildUrl(path);
  const cacheKey = `${method}:${url}`;
  const cacheTtl = Number(options.cacheTtl || GET_CACHE_TTL);

  if (shouldCache(method, options)) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
    if (inflightRequests.has(cacheKey)) return inflightRequests.get(cacheKey);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
  const { cacheTtl: _cacheTtl, timeout: _timeout, onProgress, ...fetchOptions } = options;

  const request = (async () => {
    let response;
    let payload;
    try {
      response = await fetch(url, {
        headers: isFormData
          ? fetchOptions.headers
          : {
              "Content-Type": "application/json",
              ...(fetchOptions.headers || {}),
            },
        ...fetchOptions,
        ...(onProgress && {
          headers: {
            "Content-Type": "application/json",
            ...fetchOptions.headers,
            Accept: PROGRESS_CONTENT_TYPE,
          },
        }),
        method,
        signal: fetchOptions.signal || controller.signal,
      });
      if (onProgress) {
        payload = response.ok && response.headers.get("content-type")?.includes(PROGRESS_CONTENT_TYPE)
          ? await readProgressResponse(response, onProgress)
          : await response.json();
      }
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Request timed out. Please check your connection and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    payload ??= await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(payload.message || "Request failed"), { status: response.status });
    }

    if (shouldCache(method, options)) {
      responseCache.set(cacheKey, { payload, expiresAt: Date.now() + cacheTtl });
    }

    return payload;
  })();

  if (shouldCache(method, options)) {
    inflightRequests.set(cacheKey, request);
  }

  try {
    return await request;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

export function getApiBase() {
  return API_BASE;
}

export function clearApiCache(pathPrefix = "") {
  const prefix = pathPrefix ? `GET:${API_BASE}${pathPrefix}` : "";
  for (const key of responseCache.keys()) {
    if (!prefix || key.startsWith(prefix)) responseCache.delete(key);
  }
}
