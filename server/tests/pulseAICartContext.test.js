const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPulseCartContext,
  cartKnowledgeFromQuote,
  formatCartContextForModel,
} = require("../controllers/scienceAIController");

test("empty browser cart is checked without applying charges", async () => {
  const context = await buildPulseCartContext({ items: [] });
  assert.equal(context.status, "empty");
  assert.equal(context.itemCount, 0);
  assert.deepEqual(context.additionalCharges, []);
  assert.equal(context.estimatedTotal, 0);
});

test("Pulse AI receives a complete verified temporary cart and order summary", () => {
  const context = cartKnowledgeFromQuote({
    items: [{
      productId: "product-1",
      productSlug: "test-fan",
      productName: "Test Fan",
      productCategory: "Fans",
      quantity: 2,
      unitPrice: 1000,
      lineTotal: 2000,
      couponCode: "FAN100",
      coupon: { visibility: "public", title: "Fan offer" },
      discountAmount: 200,
      discountedUnitPrice: 900,
      discountedLineTotal: 1800,
    }],
    subtotal: 2000,
    discountTotal: 200,
    discountedSubtotal: 1800,
    additionalCharges: [
      { name: "Delivery charge", slug: "delivery-charge", amount: 50 },
      { name: "Handling", slug: "handling", amount: 0 },
    ],
    additionalChargesTotal: 50,
    total: 1850,
  }, new Date("2026-09-09T12:00:00.000Z"));

  assert.equal(context.temporary, true);
  assert.equal(context.itemCount, 2);
  assert.equal(context.items[0].coupon.code, "FAN100");
  assert.equal(context.subtotalBeforeCoupons, 2000);
  assert.equal(context.couponSavings, 200);
  assert.equal(context.subtotalAfterCoupons, 1800);
  assert.equal(context.additionalChargesTotal, 50);
  assert.equal(context.estimatedTotal, 1850);
  assert.match(formatCartContextForModel(context), /TEMPORARY VERIFIED CART AND ORDER SUMMARY/);
});

test("private cart coupon code is masked while its verified discount remains available", () => {
  const context = cartKnowledgeFromQuote({
    items: [{
      productId: "product-1",
      productName: "Test Fan",
      quantity: 1,
      unitPrice: 1000,
      lineTotal: 1000,
      couponCode: "SECRET100",
      coupon: { visibility: "private", title: "Secret offer" },
      discountAmount: 100,
      discountedUnitPrice: 900,
      discountedLineTotal: 900,
    }],
    subtotal: 1000,
    discountTotal: 100,
    discountedSubtotal: 900,
    additionalCharges: [],
    total: 900,
  });
  const serialized = JSON.stringify(context);

  assert.equal(context.items[0].coupon.code, "hidden");
  assert.equal(context.items[0].coupon.discountAmount, 100);
  assert.doesNotMatch(serialized, /SECRET100|Secret offer/);
});
