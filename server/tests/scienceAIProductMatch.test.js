const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatProductMemoryLine,
  isGeneralProductDiscoveryRequest,
  isServiceOnlyRequest,
  rankProductsForDemand,
  stripCatalogMatchLine,
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

test("recovers exact speaker cards from a numbered Pulse AI reply for Bluetooth song player", () => {
  const retro = { _id: "1", name: "MZ Pink Retro Wireless Bluetooth Speaker 5W", price: 699 };
  const soundbar = { _id: "2", name: "Speaker (MZ M12VP) - Soundbar", description: "Bluetooth and AUX", price: 849 };
  const soundBox = { _id: "3", name: "Bluetooth Sound Box (MZ A005)", price: 274 };
  const products = [
    soundBox, retro, soundbar,
    { _id: "4", name: "DVD Player" },
    { _id: "5", name: "Bluetooth Audio Adapter", description: "Connects to a speaker" },
    { _id: "6", name: "Bluetooth Boombox" },
  ];
  const answer = [
    "Ye Bluetooth speakers songs sunne ke liye available hain.",
    "1. **MZ Pink Retro Wireless Bluetooth Speaker 5W** 🎵",
    "2. **Speaker (MZ M12VP) - Soundbar**",
    "3. **Bluetooth Sound Box (MZ A005)**",
    "4. **Unverified Bluetooth Speaker**",
  ].join("\n");
  assert.deepEqual(
    rankProductsForDemand("bluetooth song player", answer, products).map(({ product }) => product._id),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    new Set(rankProductsForDemand("bluetooth song player", "", products).map(({ product }) => product._id)),
    new Set(["1", "2", "3", "6"]),
  );
});

test("checks AI-listed product cards against the requested spec and budget", () => {
  const products = [
    { _id: "1", name: "Pink Bluetooth Speaker", price: 699 },
    { _id: "2", name: "Pink Wired Speaker", price: 600 },
    { _id: "3", name: "Black Bluetooth Speaker", price: 599 },
    { _id: "4", name: "Pink Bluetooth Boombox", price: 1200 },
  ];
  const reply = "Here's a recommendation.\n**CATALOG_MATCHES:** Pink Wired Speaker | Black Bluetooth Speaker | Pink Bluetooth Boombox | Pink Bluetooth Speaker";
  assert.deepEqual(
    rankProductsForDemand("pink bluetooth music player under 1000", reply, products).map(({ product }) => product._id),
    ["1"],
  );
  assert.equal(stripCatalogMatchLine(reply), "Here's a recommendation.");
});

test("a product heading alone cannot add a card to a non-shopping reply", () => {
  const products = [{ _id: "1", name: "Bluetooth Speaker" }];
  assert.deepEqual(rankProductsForDemand("contact", "1. **Bluetooth Speaker**", products), []);
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
