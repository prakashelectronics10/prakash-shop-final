const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatProductMemoryLine,
  isGeneralProductDiscoveryRequest,
  isServiceOnlyRequest,
  rankProductsForDemand,
} = require("../controllers/scienceAIProductMatch");

test("recognizes generic product discovery requests in conversational Hinglish", () => {
  assert.equal(isGeneralProductDiscoveryRequest("Mujhe suggestions do products ka"), true);
  assert.equal(isGeneralProductDiscoveryRequest("products dikhao"), true);
  assert.equal(isGeneralProductDiscoveryRequest("mera fan repair kaise hoga"), false);
});

test("repair-only requests never produce retail product suggestion cards", () => {
  const products = [{ _id: "1", name: "Ceiling Fan", category: "Cooling", availability: "In Stock" }];
  assert.equal(isServiceOnlyRequest("mera fan kharab hai repair karwana hai"), true);
  assert.deepEqual(rankProductsForDemand("mera fan kharab hai repair karwana hai", "Book a repair", products), []);
});

test("explicit color remains a hard constraint for product cards", () => {
  const products = [
    { _id: "1", name: "White Table Fan", category: "Cooling", tags: ["white", "fan"] },
    { _id: "2", name: "Blue Table Fan", category: "Cooling", tags: ["blue", "fan"] },
  ];
  const results = rankProductsForDemand("blue table fan chahiye", "Blue fan available", products);
  assert.deepEqual(results.map((item) => item.product.name), ["Blue Table Fan"]);
});

test("model output cannot inject unrelated product cards into a website-information answer", () => {
  const products = [{ _id: "1", name: "Blue Table Fan", category: "Cooling", tags: ["blue", "fan"] }];
  const results = rankProductsForDemand(
    "privacy policy ki details batao",
    "Please read the policy.\nCATALOG_MATCHES: Blue Table Fan",
    products,
  );
  assert.deepEqual(results, []);
});

test("brand and subtype words found in the catalog remain hard requirements", () => {
  const products = [
    { _id: "1", name: "Havells Table Fan", category: "Cooling", tags: ["fan"] },
    { _id: "2", name: "Generic Ceiling Fan", category: "Cooling", tags: ["fan"] },
  ];
  const results = rankProductsForDemand("Havells table fan chahiye", "Recommended fans", products);
  assert.deepEqual(results.map((item) => item.product.name), ["Havells Table Fan"]);
});

test("explicit customer budget filters out products above the maximum", () => {
  const products = [
    { _id: "1", name: "Blue Table Fan Basic", category: "Cooling", tags: ["blue", "fan"], price: 900 },
    { _id: "2", name: "Blue Table Fan Premium", category: "Cooling", tags: ["blue", "fan"], price: 1600 },
  ];
  const results = rankProductsForDemand("blue table fan 1000 ke andar chahiye", "Recommended fans", products);
  assert.deepEqual(results.map((item) => item.product.name), ["Blue Table Fan Basic"]);
});

test("generic product discovery returns available catalog cards even without a strict match", () => {
  const products = [
    { _id: "1", name: "Test product one", category: "General" },
    { _id: "2", name: "Test product two", category: "General" },
  ];
  const results = rankProductsForDemand("Mujhe suggestions do products ka", "Here are some options", products);
  assert.equal(results.length, 2);
  assert.equal(results[0].component, "Popular shop pick");
});

test("catalog memory tells Pulse AI the verified public coupon and after-offer price", () => {
  const memory = formatProductMemoryLine({
    _id: "1",
    name: "Blue Table Fan",
    category: "Cooling",
    price: 1200,
    publicCoupons: [{
      title: "Fan deal",
      code: "FAN300",
      discountAmount: 300,
      finalPrice: 900,
      minimumSubtotal: 1000,
      endsAt: "2026-10-01T00:00:00.000Z",
    }],
  });
  assert.match(memory, /base-price:Rs\.1,200/);
  assert.match(memory, /code:FAN300/);
  assert.match(memory, /after-offer:Rs\.900/);
  assert.match(memory, /minimum:Rs\.1,000/);
});

test("customer budget matching uses the current public after-offer price", () => {
  const products = [
    { _id: "1", name: "Blue Table Fan Offer", category: "Cooling", tags: ["blue", "fan"], price: 1400, effectivePrice: 950 },
    { _id: "2", name: "Blue Table Fan Premium", category: "Cooling", tags: ["blue", "fan"], price: 1600, effectivePrice: 1300 },
  ];
  const results = rankProductsForDemand("blue table fan 1000 ke andar chahiye", "Recommended fans", products);
  assert.deepEqual(results.map((item) => item.product.name), ["Blue Table Fan Offer"]);
});
