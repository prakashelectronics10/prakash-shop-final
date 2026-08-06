const API_BASE = process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "/api";
const DEFAULT_TIMEOUT = 15000;
const GET_CACHE_TTL = 60 * 1000;
const responseCache = new Map();
const inflightRequests = new Map();

function buildUrl(path) {
  return `${API_BASE}${path}`;
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
  const { cacheTtl: _cacheTtl, timeout: _timeout, ...fetchOptions } = options;

  const request = (async () => {
    let response;
    try {
      response = await fetch(url, {
        headers: isFormData
          ? fetchOptions.headers
          : {
              "Content-Type": "application/json",
              ...(fetchOptions.headers || {}),
            },
        ...fetchOptions,
        method,
        signal: fetchOptions.signal || controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Request timed out. Please check your connection and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Request failed");
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
