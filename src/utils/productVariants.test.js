import { findCombinationForOption, resolveSelectedCombination, resolveVariantStock } from "./productVariants";

const product = {
  hasVariants: true,
  availability: "In Stock",
  stock: 6,
  variantGroups: [
    { id: "colour", options: [{ id: "pink", isDefault: true }, { id: "blue" }, { id: "red" }] },
    { id: "size", options: [{ id: "small", isDefault: true }, { id: "large" }] },
  ],
  variantCombinations: [
    { id: "pink-small", optionIds: ["pink", "small"], stock: 0 },
    { id: "pink-large", optionIds: ["pink", "large"], stock: 2 },
    { id: "blue-small", optionIds: ["blue", "small"], stock: 3 },
    { id: "blue-large", optionIds: ["blue", "large"], stock: null },
    { id: "red-large", optionIds: ["red", "large"], stock: 5, isAvailable: false },
  ],
};

test("variant choices prefer the current compatible options and can switch to a valid alternative", () => {
  expect(findCombinationForOption(product, "blue", ["pink", "large"]).id).toBe("blue-large");
  expect(findCombinationForOption(product, "pink", ["blue", "small"]).id).toBe("pink-large");
  expect(findCombinationForOption(product, "red", ["pink", "large"])).toBeNull();
  expect(findCombinationForOption(product, "red", ["pink", "large"], { availableOnly: false }).id).toBe("red-large");
});

test("an in-stock default and an explicit sold-out variant link resolve independently", () => {
  expect(resolveSelectedCombination(product).id).toBe("pink-large");
  expect(resolveSelectedCombination(product, { combinationId: "pink-small" }).id).toBe("pink-small");
  expect(resolveVariantStock(product, product.variantCombinations[3])).toBe(6);
});
