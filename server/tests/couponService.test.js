const test = require("node:test");
const assert = require("node:assert/strict");
const { allocateCouponDiscount, calculateCouponDiscount, couponMatchesItem, normalizedCode, priceProductCouponItems } = require("../services/couponService");
const { couponSchema } = require("../validations/adminSchemas");

const shopItem = {
  sourceType: "shop-product",
  productId: "66aa11111111111111111111",
  productCategory: "Fans",
  lineTotal: 2000,
};

test("normalizes human-entered coupon codes", () => {
  assert.equal(normalizedCode(" save 10 "), "SAVE10");
});

test("matches only scoped shop products and never wiring catalogue items", () => {
  const coupon = { appliesToAll: false, productIds: [shopItem.productId], categories: [] };
  assert.equal(couponMatchesItem(coupon, shopItem), true);
  assert.equal(couponMatchesItem(coupon, { ...shopItem, sourceType: "project-part" }), false);
});

test("calculates percentage discounts with a configured maximum cap", () => {
  const result = calculateCouponDiscount({
    appliesToAll: true,
    discountType: "percent",
    discountValue: 20,
    maxDiscountAmount: 250,
    minimumSubtotal: 1000,
  }, [shopItem]);
  assert.equal(result.valid, true);
  assert.equal(result.discountAmount, 250);
  assert.equal(result.eligibleSubtotal, 2000);
});

test("category coupons ignore unrelated cart lines and honor minimum subtotal", () => {
  const coupon = {
    appliesToAll: false,
    productIds: [],
    categories: ["Fans"],
    discountType: "fixed",
    discountValue: 300,
    minimumSubtotal: 1500,
  };
  const result = calculateCouponDiscount(coupon, [
    shopItem,
    { ...shopItem, productId: "66aa22222222222222222222", productCategory: "Speakers", lineTotal: 5000 },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.eligibleSubtotal, 2000);
  assert.equal(result.discountAmount, 300);
});

test("allocates the exact coupon discount across eligible cart lines only", () => {
  const coupon = { appliesToAll: false, productIds: [], categories: ["Fans"] };
  const items = allocateCouponDiscount([
    { ...shopItem, quantity: 2, lineTotal: 2000 },
    { ...shopItem, productId: "66aa22222222222222222222", productCategory: "Speakers", quantity: 1, lineTotal: 800 },
  ], coupon, 300);
  assert.equal(items[0].discountAmount, 300);
  assert.equal(items[0].discountedLineTotal, 1700);
  assert.equal(items[0].discountedUnitPrice, 850);
  assert.equal(items[1].discountAmount, 0);
  assert.equal(items[1].discountedLineTotal, 800);
});

test("keeps proportional rounding equal to the quoted discount", () => {
  const coupon = { appliesToAll: true };
  const items = allocateCouponDiscount([
    { ...shopItem, quantity: 1, lineTotal: 999 },
    { ...shopItem, productId: "66aa22222222222222222222", quantity: 2, lineTotal: 1001 },
  ], coupon, 333.33);
  assert.equal(Number(items.reduce((sum, item) => sum + item.discountAmount, 0).toFixed(2)), 333.33);
  assert.equal(Number(items.reduce((sum, item) => sum + item.discountedLineTotal, 0).toFixed(2)), 1666.67);
});

test("admin coupon validation rejects unsafe percentages and empty scopes", () => {
  const result = couponSchema.safeParse({
    title: "Invalid sale",
    code: "BAD101",
    visibility: "public",
    discountType: "percent",
    discountValue: 101,
    appliesToAll: false,
    productIds: [],
    categories: [],
  });
  assert.equal(result.success, false);
  assert.equal(result.error.issues.some((issue) => issue.path[0] === "discountValue"), true);
  assert.equal(result.error.issues.some((issue) => issue.path[0] === "productIds"), true);
});

const fan = { ...shopItem, productName: "Fan", unitPrice: 888, quantity: 1, lineTotal: 888 };
const speaker = { ...shopItem, productId: "66aa22222222222222222222", productName: "Speaker", productCategory: "Speakers", unitPrice: 799.2, quantity: 1, lineTotal: 799.2 };
const fanCoupon = { code: "FAN100", title: "Fan offer", visibility: "public", categories: ["Fans"], discountType: "fixed", discountValue: 100 };
const speakerCoupon = { code: "SPEAKER50", title: "Private speaker offer", visibility: "private", categories: ["Speakers"], discountType: "fixed", discountValue: 50 };

test("different products retain their own coupons and sum final prices without a second deduction", () => {
  const result = priceProductCouponItems([fan, speaker], [{ couponCode: "FAN100" }, { couponCode: "SPEAKER50" }], [fanCoupon, speakerCoupon]);
  assert.deepEqual(result.map((item) => item.discountedUnitPrice), [788, 749.2]);
  const subtotal = Number(result.reduce((sum, item) => sum + item.discountedLineTotal, 0).toFixed(2));
  assert.equal(subtotal, 1537.2);
  assert.equal(subtotal + 120, 1657.2);
});

test("fixed discount is applied per unit exactly as on the product page", () => {
  const result = priceProductCouponItems([{ ...fan, quantity: 3, lineTotal: 2664 }, speaker], [{ couponCode: "FAN100" }, {}], [fanCoupon, speakerCoupon]);
  assert.equal(result[0].discountedUnitPrice, 788);
  assert.equal(result[0].discountedLineTotal, 2364);
  assert.equal(result[0].discountAmount, 300);
  assert.equal(result[1].discountedLineTotal, 799.2);
  assert.equal(result[1].couponCode, "");
});

test("shared public coupon applies its full discount to each eligible product", () => {
  const coupon = { ...fanCoupon, appliesToAll: true };
  const result = priceProductCouponItems([fan, speaker], [{}, {}], [coupon]);
  assert.deepEqual(result.map((item) => item.discountedUnitPrice), [788, 699.2]);
});

test("percentage cap and paise rounding stay consistent per unit across quantities", () => {
  const coupon = { ...speakerCoupon, discountType: "percent", discountValue: 15, maxDiscountAmount: 90 };
  const result = priceProductCouponItems([{ ...speaker, quantity: 3, lineTotal: 2397.6 }], [{ couponCode: "SPEAKER50" }], [coupon]);
  assert.equal(result[0].discountedUnitPrice, 709.2);
  assert.equal(result[0].discountedLineTotal, 2127.6);
  assert.equal(result[0].discountAmount, 270);
});

test("expired or ineligible selected coupons cannot silently change the payment amount", () => {
  assert.throws(() => priceProductCouponItems([fan], [{ couponCode: "EXPIRED" }], [fanCoupon]), /expired or inactive/);
  assert.throws(() => priceProductCouponItems([fan], [{ couponCode: "SPEAKER50" }], [speakerCoupon]), /does not apply/);
});

test("admin accepts both image layouts and rejects invalid display settings", () => {
  const payload = { title: "Test offer", code: "TEST10", discountValue: 10, appliesToAll: true };
  assert.equal(couponSchema.parse({ ...payload, imageLayout: "thumbnail" }).imageLayout, "thumbnail");
  assert.equal(couponSchema.parse(payload).imageLayout, "banner");
  assert.equal(couponSchema.safeParse({ ...payload, imageLayout: "crop" }).success, false);
});
