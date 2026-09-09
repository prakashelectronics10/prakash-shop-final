const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildWebsiteKnowledge,
  isCurrentPublicOffer,
  productKnowledge,
} = require("../services/pulseAIKnowledgeService");

test("Pulse AI knowledge serializes public coupons without changing the base price", () => {
  const product = productKnowledge({
    _id: "product-1",
    name: "Test Fan",
    slug: "test-fan",
    category: "Fans",
    price: 1200,
    effectivePrice: 900,
    publicCoupons: [{
      title: "Fan deal",
      code: "FAN300",
      visibility: "public",
      discountAmount: 300,
      finalPrice: 900,
    }],
  });

  assert.equal(product.basePrice, 1200);
  assert.equal(product.effectivePrice, 900);
  assert.equal(product.publicCoupons[0].code, "FAN300");
  assert.equal(product.publicCoupons[0].visibility, undefined);
});

test("website knowledge excludes expired and future recent offers", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const site = {
    offers: [
      { title: "Live", startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-10T00:00:00.000Z" },
      { title: "Expired", endsAt: "2026-09-09T12:00:00.000Z" },
      { title: "Future", startsAt: "2026-09-09T12:00:01.000Z" },
    ],
  };
  const serialized = buildWebsiteKnowledge(site, [], {}, now);
  const snapshot = JSON.parse(serialized.split("\n").slice(1).join("\n"));

  assert.deepEqual(snapshot.offersAndRecentUpdates.map((offer) => offer.title), ["Live"]);
  assert.equal(isCurrentPublicOffer(site.offers[0], now), true);
  assert.equal(isCurrentPublicOffer(site.offers[1], now), false);
});
