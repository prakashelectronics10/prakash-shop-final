const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyPricingFields,
  buildPricingPayload,
  calculateSellingPrice,
  formatINR,
  resolveProductPricing,
} = require("../utils/productPricing");

test("exports the pricing helper expected by product controllers", () => {
  assert.equal(typeof applyPricingFields, "function");
  assert.equal(applyPricingFields, buildPricingPayload);
});

test("derives selling price from MRP and discount", () => {
  assert.deepEqual(
    applyPricingFields({ mrp: "999", discountPercent: "20", price: "999" }),
    { mrp: 999, discountPercent: 20, price: 799 },
  );
});

test("keeps a manually entered price when no discount is set", () => {
  assert.deepEqual(
    applyPricingFields({ mrp: "", discountPercent: "", price: "250" }),
    { mrp: null, discountPercent: null, price: 250 },
  );
});

test("keeps calculation, display pricing and Indian currency formatting consistent", () => {
  assert.equal(calculateSellingPrice(2499, 12.5), 2187);
  assert.deepEqual(resolveProductPricing({ mrp: 2499, discountPercent: 12.5, price: 1 }), {
    mrp: 2499,
    price: 2187,
    discountPercent: 12.5,
    showMrp: true,
    showDiscount: true,
  });
  assert.equal(formatINR(2187), "₹2,187");
  assert.equal(formatINR(1537.2), "₹1,537.20");
  assert.equal(formatINR("not-a-price"), "Price on request");
});
