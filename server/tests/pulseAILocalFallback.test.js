const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLocalResponse } = require("../controllers/scienceAIController");

const speaker = {
  _id: "speaker-1",
  name: "Bluetooth speaker with Mic",
  category: "Speaker",
  availability: "In Stock",
  price: 799,
  effectivePrice: 699,
  shortDescription: "Portable Bluetooth audio speaker with microphone",
  tags: ["speaker", "bluetooth", "audio", "mic"],
  bestPublicCoupon: {
    code: "SAVE100",
    finalPrice: 699,
  },
};

test("offline product fallback stays relevant and uses verified catalog data", () => {
  const response = buildLocalResponse(
    "Mujhe Bluetooth speaker suggest karo",
    0,
    "network unavailable",
    [speaker],
  );

  assert.match(response, /Bluetooth speaker with Mic/);
  assert.match(response, /Rs\.699/);
  assert.match(response, /SAVE100/);
  assert.doesNotMatch(response, /Arduino|Gemini API/i);
});

test("offline repair fallback gives safe actionable guidance instead of placeholder components", () => {
  const response = buildLocalResponse(
    "Mera TV repair karwana hai, display kaam nahi kar raha",
    0,
    "fetch failed",
    [],
  );

  assert.match(response, /Switch the appliance off/);
  assert.match(response, /brand\/model and exact symptom/);
  assert.doesNotMatch(response, /Arduino|Breadboard|Gemini API/i);
});
