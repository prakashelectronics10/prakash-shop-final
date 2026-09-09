import { buildPricingPayload, calculateSellingPrice, formatINR, resolveProductPricing } from "./productPricing";

describe("product pricing", () => {
  it("uses the same rounded selling price everywhere", () => {
    expect(calculateSellingPrice(2499, 12.5)).toBe(2187);
    expect(buildPricingPayload({ mrp: "2499", discountPercent: "12.5", price: "1" })).toEqual({
      mrp: 2499,
      discountPercent: 12.5,
      price: 2187,
    });
    expect(resolveProductPricing({ mrp: 2499, discountPercent: 12.5, price: 1 })).toMatchObject({
      mrp: 2499,
      price: 2187,
      showMrp: true,
      showDiscount: true,
    });
  });

  it("formats valid rupee values and never renders NaN", () => {
    expect(formatINR(2187)).toBe("₹2,187");
    expect(formatINR(1537.2)).toBe("₹1,537.20");
    expect(formatINR("not-a-price")).toBe("Price on request");
  });
});
