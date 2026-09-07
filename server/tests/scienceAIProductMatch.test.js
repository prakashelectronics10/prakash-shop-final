const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isGeneralProductDiscoveryRequest,
  rankProductsForDemand,
} = require("../controllers/scienceAIProductMatch");

test("recognizes generic product discovery requests in conversational Hinglish", () => {
  assert.equal(isGeneralProductDiscoveryRequest("Mujhe suggestions do products ka"), true);
  assert.equal(isGeneralProductDiscoveryRequest("products dikhao"), true);
  assert.equal(isGeneralProductDiscoveryRequest("mera fan repair kaise hoga"), false);
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
