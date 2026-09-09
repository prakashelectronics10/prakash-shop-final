const Coupon = require("../models/Coupon");
const AppError = require("../utils/AppError");

function roundMoney(value) {
  return Number(Math.max(0, Number(value || 0)).toFixed(2));
}

function normalizedCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function activeCouponFilter(now = new Date()) {
  return {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
    ],
  };
}

function couponMatchesItem(coupon = {}, item = {}) {
  if (coupon.appliesToAll) return String(item.sourceType || "") === "shop-product";
  if (String(item.sourceType || "") !== "shop-product") return false;
  const itemId = String(item.productId || item.sourceId || "");
  const productIds = (coupon.productIds || []).map((value) => String(value));
  if (itemId && productIds.includes(itemId)) return true;
  const category = String(item.productCategory || item.category || "").trim().toLowerCase();
  return Boolean(category) && (coupon.categories || []).some((value) => String(value || "").trim().toLowerCase() === category);
}

function calculateCouponDiscount(coupon = {}, items = []) {
  const eligibleItems = (Array.isArray(items) ? items : []).filter((item) => couponMatchesItem(coupon, item));
  const eligibleSubtotal = roundMoney(eligibleItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  if (!eligibleItems.length) {
    return { valid: false, reason: "This coupon does not apply to the selected products", discountAmount: 0, eligibleSubtotal, eligibleItems: [] };
  }
  if (eligibleSubtotal < Number(coupon.minimumSubtotal || 0)) {
    return {
      valid: false,
      reason: `Eligible products must total at least Rs. ${Number(coupon.minimumSubtotal || 0).toLocaleString("en-IN")}`,
      discountAmount: 0,
      eligibleSubtotal,
      eligibleItems,
    };
  }

  let discountAmount = coupon.discountType === "fixed"
    ? Number(coupon.discountValue || 0)
    : eligibleSubtotal * (Number(coupon.discountValue || 0) / 100);
  if (coupon.discountType === "percent" && Number(coupon.maxDiscountAmount) > 0) {
    discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountAmount));
  }
  discountAmount = roundMoney(Math.min(eligibleSubtotal, discountAmount));
  if (discountAmount <= 0) {
    return { valid: false, reason: "This coupon currently has no applicable discount", discountAmount: 0, eligibleSubtotal, eligibleItems };
  }
  return { valid: true, reason: "", discountAmount, eligibleSubtotal, eligibleItems };
}

function allocateCouponDiscount(items = [], coupon = null, discountAmount = 0) {
  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const lineTotal = roundMoney(item.lineTotal);
    return {
      ...item,
      discountAmount: 0,
      discountedLineTotal: lineTotal,
      discountedUnitPrice: roundMoney(lineTotal / quantity),
    };
  });
  const totalDiscount = roundMoney(discountAmount);
  if (!coupon || totalDiscount <= 0) return normalizedItems;

  const eligibleIndexes = normalizedItems
    .map((item, index) => (couponMatchesItem(coupon, item) ? index : -1))
    .filter((index) => index >= 0);
  const eligibleSubtotal = roundMoney(eligibleIndexes.reduce(
    (sum, index) => sum + Number(normalizedItems[index].lineTotal || 0),
    0,
  ));
  if (!eligibleIndexes.length || eligibleSubtotal <= 0) return normalizedItems;

  let remainingDiscount = roundMoney(Math.min(totalDiscount, eligibleSubtotal));
  eligibleIndexes.forEach((itemIndex, eligiblePosition) => {
    const item = normalizedItems[itemIndex];
    const isLast = eligiblePosition === eligibleIndexes.length - 1;
    const proportionalDiscount = isLast
      ? remainingDiscount
      : roundMoney(totalDiscount * (Number(item.lineTotal || 0) / eligibleSubtotal));
    const itemDiscount = roundMoney(Math.min(Number(item.lineTotal || 0), proportionalDiscount, remainingDiscount));
    const discountedLineTotal = roundMoney(Number(item.lineTotal || 0) - itemDiscount);
    normalizedItems[itemIndex] = {
      ...item,
      discountAmount: itemDiscount,
      discountedLineTotal,
      discountedUnitPrice: roundMoney(discountedLineTotal / Math.max(1, Number(item.quantity || 1))),
    };
    remainingDiscount = roundMoney(remainingDiscount - itemDiscount);
  });

  return normalizedItems;
}

function couponSnapshot(coupon, result) {
  return {
    couponId: coupon._id,
    code: coupon.code,
    title: coupon.title,
    visibility: coupon.visibility,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: result.discountAmount,
  };
}

// Product-page offers are unit discounts. Apply that exact unit price to each
// quantity, without spreading one product's coupon across other cart lines.
function priceProductCouponItems(items, selections, coupons, legacyCode = "") {
  return items.map((item, index) => {
    const unitItem = { ...item, quantity: 1, lineTotal: item.unitPrice };
    const selectedCode = normalizedCode(selections[index]?.couponCode);
    const legacy = coupons.find((coupon) => coupon.code === normalizedCode(legacyCode)
      && couponMatchesItem(coupon, unitItem));
    let selected = selectedCode ? coupons.find((coupon) => coupon.code === selectedCode) : null;
    let result;
    if (selectedCode) {
      if (!selected) throw new AppError(`${item.productName}: coupon ${selectedCode} is expired or inactive. Remove it in your cart or choose another offer.`, 400);
      result = calculateCouponDiscount(selected, [unitItem]);
      if (!result.valid) throw new AppError(`${item.productName}: ${result.reason}. Remove the coupon in your cart or choose another offer.`, 400);
    } else {
      const candidates = coupons.filter((coupon) => coupon.visibility === "public"
        || (selections[index]?.couponCode === undefined && coupon === legacy));
      const best = candidates.map((coupon) => ({ coupon, result: calculateCouponDiscount(coupon, [unitItem]) }))
        .filter((entry) => entry.result.valid)
        .sort((a, b) => b.result.discountAmount - a.result.discountAmount || String(a.coupon.title).localeCompare(String(b.coupon.title)))[0];
      selected = best?.coupon;
      result = best?.result;
    }
    const discountPerUnit = roundMoney(result?.discountAmount || 0);
    const discountedUnitPrice = roundMoney(item.unitPrice - discountPerUnit);
    const discountAmount = roundMoney(discountPerUnit * item.quantity);
    return {
      ...item,
      couponCode: selected?.code || "",
      coupon: selected ? couponSnapshot(selected, { discountAmount }) : null,
      discountAmount,
      discountedUnitPrice,
      discountedLineTotal: roundMoney(discountedUnitPrice * item.quantity),
    };
  });
}

async function priceOrderCoupons(items, selections, legacyCode = "") {
  const codes = [...new Set([legacyCode, ...selections.map((item) => item.couponCode)].map(normalizedCode).filter(Boolean))];
  const coupons = await Coupon.find({
    ...activeCouponFilter(),
    $or: [{ visibility: "public" }, { code: { $in: codes } }],
  }).sort({ displayOrder: 1, createdAt: -1 }).lean();
  return priceProductCouponItems(items, selections, coupons, legacyCode);
}

function publicCoupon(coupon, result, unitPrice = null) {
  return {
    id: String(coupon._id),
    title: coupon.title,
    code: coupon.code,
    description: coupon.description || "",
    visibility: coupon.visibility,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscountAmount: coupon.maxDiscountAmount,
    minimumSubtotal: coupon.minimumSubtotal || 0,
    bannerImageUrl: coupon.visibility === "public" ? coupon.bannerImageUrl || "" : "",
    imageLayout: coupon.imageLayout === "thumbnail" ? "thumbnail" : "banner",
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    discountAmount: result.discountAmount,
    finalPrice: unitPrice === null ? null : roundMoney(Number(unitPrice) - result.discountAmount),
  };
}

async function validateCouponForItems(code, items, { requirePublic = false } = {}) {
  const safeCode = normalizedCode(code);
  if (!safeCode) throw new AppError("Enter a coupon code", 400);
  const coupon = await Coupon.findOne({ code: safeCode, ...activeCouponFilter(), ...(requirePublic ? { visibility: "public" } : {}) }).lean();
  if (!coupon) throw new AppError("Coupon is invalid, expired, or inactive", 404);
  const result = calculateCouponDiscount(coupon, items);
  if (!result.valid) throw new AppError(result.reason, 400);
  return { coupon, result, snapshot: couponSnapshot(coupon, result) };
}

async function listPublicCouponsForProduct(product, unitPrice) {
  const items = [{
    sourceType: "shop-product",
    productId: product._id,
    productCategory: product.category || "Electronics",
    lineTotal: Number(unitPrice || 0),
  }];
  const coupons = await Coupon.find({ ...activeCouponFilter(), visibility: "public" })
    .sort({ displayOrder: 1, createdAt: -1 })
    .limit(100)
    .lean();
  return coupons
    .map((coupon) => ({ coupon, result: calculateCouponDiscount(coupon, items) }))
    .filter(({ result }) => result.valid)
    .map(({ coupon, result }) => publicCoupon(coupon, result, unitPrice))
    .sort((a, b) => b.discountAmount - a.discountAmount || String(a.title).localeCompare(String(b.title)))
    .slice(0, 12);
}

module.exports = {
  activeCouponFilter,
  allocateCouponDiscount,
  calculateCouponDiscount,
  couponMatchesItem,
  listPublicCouponsForProduct,
  normalizedCode,
  priceOrderCoupons,
  priceProductCouponItems,
  publicCoupon,
  validateCouponForItems,
};
