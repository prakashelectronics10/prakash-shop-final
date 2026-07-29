/** Shared MRP / discount / selling-price helpers for shop + wiring products. */

export function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampDiscountPercent(value) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return null;
  return Math.min(100, Math.max(0, parsed));
}

export function calculateSellingPrice(mrp, discountPercent) {
  const base = toNumberOrNull(mrp);
  if (base === null || base < 0) return null;
  const discount = clampDiscountPercent(discountPercent);
  if (discount === null || discount <= 0) return Math.round(base);
  return Math.max(0, Math.round(base * (1 - discount / 100)));
}

/**
 * Normalize pricing payload for admin/API save.
 * Selling price is derived from MRP + % discount when discount is set.
 */
export function buildPricingPayload({ mrp, discountPercent, price } = {}) {
  const nextMrp = toNumberOrNull(mrp);
  const nextDiscount = clampDiscountPercent(discountPercent);
  let nextPrice = toNumberOrNull(price);

  if (nextMrp !== null && nextDiscount !== null && nextDiscount > 0) {
    nextPrice = calculateSellingPrice(nextMrp, nextDiscount);
  }

  return {
    mrp: nextMrp,
    discountPercent: nextDiscount,
    price: nextPrice,
  };
}

export function resolveProductPricing(product = {}) {
  const mrp = toNumberOrNull(product.mrp);
  const storedDiscount = clampDiscountPercent(product.discountPercent);
  let price = toNumberOrNull(product.price);

  if (mrp !== null && storedDiscount !== null && storedDiscount > 0) {
    price = calculateSellingPrice(mrp, storedDiscount);
  }

  const showMrp = mrp !== null && price !== null && mrp > price;
  let discountPercent = storedDiscount;
  if (showMrp && (discountPercent === null || discountPercent <= 0) && mrp > 0) {
    discountPercent = Math.round(((mrp - price) / mrp) * 100);
  }

  return {
    mrp,
    price,
    discountPercent: discountPercent !== null && discountPercent > 0 ? discountPercent : null,
    showMrp,
    showDiscount: showMrp && discountPercent !== null && discountPercent > 0,
  };
}

export function formatINR(amount) {
  if (amount === null || amount === undefined || amount === "") return "Price on request";
  return `₹ ${Number(amount).toLocaleString("en-IN")}`;
}
