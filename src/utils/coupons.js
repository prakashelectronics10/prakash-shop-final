const COUPON_STORAGE_KEY = "prakash:applied-coupon:v1";
const PRODUCT_COUPONS_KEY = "prakash:product-coupons:v2";
export const COUPON_CHANGED_EVENT = "prakash:coupon-changed";

function productKey(product) {
  return String(product?.sourceId || product?.productId || product?._id || product?.id || product?.slug || "");
}

export function getAppliedCouponCode(product, legacyFallback = true) {
  if (typeof window === "undefined") return "";
  try {
    if (product) {
      const codes = JSON.parse(window.sessionStorage.getItem(PRODUCT_COUPONS_KEY) || "{}");
      if (Object.prototype.hasOwnProperty.call(codes, productKey(product))) return String(codes[productKey(product)] || "");
    }
    if (!legacyFallback) return undefined;
    return String(window.sessionStorage.getItem(COUPON_STORAGE_KEY) || "").trim().toUpperCase();
  } catch (_error) {
    return "";
  }
}

export function setAppliedCouponCode(code, product) {
  if (typeof window === "undefined") return;
  const safeCode = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  try {
    if (product) {
      const codes = JSON.parse(window.sessionStorage.getItem(PRODUCT_COUPONS_KEY) || "{}");
      codes[productKey(product)] = safeCode;
      window.sessionStorage.setItem(PRODUCT_COUPONS_KEY, JSON.stringify(codes));
    } else if (safeCode) window.sessionStorage.setItem(COUPON_STORAGE_KEY, safeCode);
    else {
      window.sessionStorage.removeItem(COUPON_STORAGE_KEY);
      window.sessionStorage.removeItem(PRODUCT_COUPONS_KEY);
    }
  } catch (_error) {
    // The active page can still use the coupon when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(COUPON_CHANGED_EVENT, { detail: { code: safeCode } }));
}

export function couponOrderItems(items) {
  return items.map((item) => ({
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    productId: item.productId,
    productSlug: item.productSlug,
    quantity: item.quantity,
    couponCode: getAppliedCouponCode(item, false),
  }));
}

export function clearAppliedCouponCode() {
  setAppliedCouponCode("");
}
