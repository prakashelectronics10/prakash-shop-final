const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertOrderableVariant,
  findCombinationByOptionIds,
  formatVariantSummary,
  productHasVariants,
  resolveOptionDisplayType,
  resolveVariantPricing,
  resolveVariantStock,
  resolveSelectedCombination,
  sanitizeProductVariants,
} = require("../utils/productVariants");

function sampleProduct(overrides = {}) {
  return {
    name: "LED Decoration Light",
    sku: "PE-LED-001",
    mrp: 1000,
    price: 800,
    quantity: 10,
    availability: "In Stock",
    hasVariants: true,
    variantGroups: [
      {
        id: "grp_color",
        name: "Design",
        displayType: "auto",
        sortOrder: 0,
        options: [
          { id: "opt_leaf", label: "Leaf", imageUrl: "https://cdn.example/leaf.jpg", colour: "", sortOrder: 0, isDefault: true },
          { id: "opt_star", label: "Star", imageUrl: "", colour: "", sortOrder: 1, isDefault: false },
        ],
      },
      {
        id: "grp_length",
        name: "Length",
        displayType: "text",
        sortOrder: 1,
        options: [
          { id: "opt_5m", label: "5m", sortOrder: 0, isDefault: true },
          { id: "opt_10m", label: "10m", sortOrder: 1, isDefault: false },
        ],
      },
    ],
    variantCombinations: [
      { id: "cmb_1", optionIds: ["opt_leaf", "opt_5m"], sku: "LED-LEAF-5", stock: 4, isAvailable: true, priceAdjustment: 0 },
      { id: "cmb_2", optionIds: ["opt_leaf", "opt_10m"], sku: "LED-LEAF-10", stock: 0, isAvailable: true, priceAdjustment: 100 },
      { id: "cmb_3", optionIds: ["opt_star", "opt_5m"], sku: "LED-STAR-5", stock: 2, isAvailable: false, priceAdjustment: 0 },
      { id: "cmb_4", optionIds: ["opt_star", "opt_10m"], sku: "LED-STAR-10", stock: 3, isAvailable: true, priceAdjustment: 150 },
    ],
    ...overrides,
  };
}

test("sanitizeProductVariants fills missing combinations for enabled products", () => {
  const result = sanitizeProductVariants({
    hasVariants: true,
    variantGroups: sampleProduct().variantGroups,
    variantCombinations: [],
  });
  assert.equal(result.hasVariants, true);
  assert.equal(result.variantCombinations.length, 4);
});

test("resolveOptionDisplayType falls back to text when image/colour missing", () => {
  assert.equal(
    resolveOptionDisplayType({ displayType: "image_text" }, { imageUrl: "", colour: "" }),
    "text",
  );
  assert.equal(
    resolveOptionDisplayType({ displayType: "auto" }, { imageUrl: "https://cdn.example/a.jpg" }),
    "image_text",
  );
  assert.equal(
    resolveOptionDisplayType({ displayType: "auto" }, { colour: "#FF0000" }),
    "color_text",
  );
});

test("variant pricing and stock resolve from selected combination", () => {
  const product = sampleProduct();
  const combination = findCombinationByOptionIds(product, ["opt_leaf", "opt_10m"]);
  assert.equal(resolveVariantStock(product, combination), 0);
  assert.equal(resolveVariantPricing(product, combination).price, 900);
  assert.equal(formatVariantSummary(product, combination.optionIds), "Design: Leaf, Length: 10m");
});

test("assertOrderableVariant blocks unavailable combinations", () => {
  const product = sampleProduct();
  assert.throws(
    () => assertOrderableVariant(product, { combinationId: "cmb_3", quantity: 1 }),
    /not available/,
  );
  assert.throws(
    () => assertOrderableVariant(product, { combinationId: "cmb_2", quantity: 1 }),
    /only 0/,
  );
  const ok = assertOrderableVariant(product, { combinationId: "cmb_1", quantity: 2 });
  assert.equal(ok.combination.id, "cmb_1");
  assert.equal(ok.sku, "LED-LEAF-5");
});

test("default skips sold-out stock but a direct link can still identify that variant", () => {
  const product = sampleProduct();
  product.variantCombinations[0].stock = 0;
  assert.equal(resolveSelectedCombination(product).id, "cmb_4");
  assert.equal(resolveSelectedCombination(product, { combinationId: "cmb_1" }).id, "cmb_1");
});

test("checkout rejects removed or mismatched variants instead of choosing a replacement", () => {
  const product = sampleProduct();
  assert.throws(() => assertOrderableVariant(product, { combinationId: "removed" }), /reselect/);
  assert.throws(() => assertOrderableVariant(product, { optionIds: ["missing"] }), /reselect/);
  assert.throws(() => assertOrderableVariant(product, {
    combinationId: "cmb_1", optionIds: ["opt_star", "opt_10m"],
  }), /reselect/);
  assert.equal(assertOrderableVariant(product, { optionIds: ["opt_10m", "opt_star"] }).combination.id, "cmb_4");
});

test("products without variants remain unchanged", () => {
  assert.equal(productHasVariants({ name: "Fan" }), false);
  const sanitized = sanitizeProductVariants({ hasVariants: false, variantGroups: [{ name: "Colour" }] });
  assert.deepEqual(sanitized, { hasVariants: false, variantGroups: [], variantCombinations: [] });
});
