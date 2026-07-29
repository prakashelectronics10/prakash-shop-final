import { apiRequest } from "../api/client";

const VIEW_COOLDOWN_MS = 30 * 60 * 1000;
const STORAGE_PREFIX = "pe-product-view:";

function viewStorageKey(productId) {
  return `${STORAGE_PREFIX}${String(productId || "").trim()}`;
}

function hasRecentView(productId) {
  if (typeof window === "undefined" || !productId) return true;
  try {
    const raw = window.sessionStorage.getItem(viewStorageKey(productId));
    const stampedAt = Number(raw || 0);
    return Number.isFinite(stampedAt) && Date.now() - stampedAt < VIEW_COOLDOWN_MS;
  } catch (_error) {
    return false;
  }
}

function markViewed(productId) {
  if (typeof window === "undefined" || !productId) return;
  try {
    window.sessionStorage.setItem(viewStorageKey(productId), String(Date.now()));
  } catch (_error) {
    // Ignore storage failures (private mode / quota).
  }
}

/**
 * Count one product detail view per browser session cooldown window.
 * Fire-and-forget — never blocks the detail page UI.
 */
export function trackProductPageView(product) {
  const productId = String(product?.slug || product?._id || product?.sourceId || product?.id || "").trim();
  if (!productId || hasRecentView(productId)) return;

  markViewed(productId);
  apiRequest(`/shop-products/public/products/${encodeURIComponent(productId)}/view`, {
    method: "POST",
    cache: "no-store",
    timeout: 8000,
  }).catch(() => {
    // Tracking should never interrupt browsing.
  });
}
