import { clearAppliedCouponCode, couponOrderItems, getAppliedCouponCode, setAppliedCouponCode } from "./coupons";

beforeEach(() => window.sessionStorage.clear());

test("applying or removing a coupon on one product preserves other products' coupons", () => {
  const fan = { _id: "fan-id" };
  const speaker = { _id: "speaker-id" };
  setAppliedCouponCode("FAN100", fan);
  setAppliedCouponCode("SPEAKER50", speaker);
  expect(getAppliedCouponCode(fan)).toBe("FAN100");
  expect(getAppliedCouponCode(speaker)).toBe("SPEAKER50");
  const payload = couponOrderItems([
    { sourceType: "shop-product", sourceId: "fan-id", quantity: 3 },
    { sourceType: "shop-product", sourceId: "speaker-id", quantity: 1 },
  ]);
  expect(payload.map((item) => item.couponCode)).toEqual(["FAN100", "SPEAKER50"]);
  setAppliedCouponCode("", speaker);
  expect(getAppliedCouponCode(fan)).toBe("FAN100");
  expect(getAppliedCouponCode(speaker)).toBe("");
  clearAppliedCouponCode();
  expect(getAppliedCouponCode(fan)).toBe("");
});
