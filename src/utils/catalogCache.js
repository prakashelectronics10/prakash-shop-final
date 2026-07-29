const DEFAULT_TTL_MS = 5 * 60 * 1000;

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

/**
 * Read a sessionStorage catalog snapshot. Returns null when missing/expired.
 * Stale entries past soft TTL still return data so callers can paint immediately
 * while a background refresh runs (pass allowStale: true).
 */
export function readCatalogCache(key, { ttlMs = DEFAULT_TTL_MS, allowStale = false } = {}) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.data == null) return null;
    const age = Date.now() - Number(parsed.savedAt || 0);
    if (!allowStale && age > ttlMs) return null;
    return {
      data: parsed.data,
      stale: age > ttlMs,
      savedAt: parsed.savedAt,
    };
  } catch (_error) {
    return null;
  }
}

export function writeCatalogCache(key, data) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch (_error) {
    // Quota / private mode — ignore
  }
}

export const CATALOG_CACHE_TTL_MS = DEFAULT_TTL_MS;
export const SHOP_CATALOG_CACHE_KEY = "prakash:shop-catalog:v1";
export const WIRING_CATALOG_CACHE_KEY = "prakash:wiring-catalog:v1";
