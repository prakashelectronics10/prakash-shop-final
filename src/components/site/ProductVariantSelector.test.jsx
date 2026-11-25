import { act } from "react";
import { createRoot } from "react-dom/client";
import { ProductVariantSelector } from "./ProductVariantSelector";

test.each([
  ["#FFFFFF", "#000"],
  ["#2563EB", "#fff"],
])("the selected tile uses %s as its theme with a contrasting check background", (colour, checkBackground) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const product = {
    hasVariants: true,
    price: 100,
    variantGroups: [{ id: "colour", name: "Colour", options: [{ id: "chosen", label: "Selected", colour }] }],
    variantCombinations: [{ id: "sample", optionIds: ["chosen"], stock: 1 }],
  };
  const previousActEnvironment = window.IS_REACT_ACT_ENVIRONMENT;
  window.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() => root.render(<ProductVariantSelector product={product} selectedOptionIds={["chosen"]} />));
    const tile = container.querySelector(".variant-option.is-selected");
    expect(tile.style.getPropertyValue("--variant-selected-colour")).toBe(colour);
    expect(tile.style.getPropertyValue("--variant-check-background")).toBe(checkBackground);
    expect(tile.querySelector(".variant-option-check")).not.toBeNull();
    expect(container.querySelector(".variant-option-price").textContent).toBe("₹100");
  } finally {
    act(() => root.unmount());
    window.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
