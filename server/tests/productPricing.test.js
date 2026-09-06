const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyPricingFields,
  buildPricingPayload,
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
