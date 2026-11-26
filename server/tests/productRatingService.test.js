const test = require("node:test");
const assert = require("node:assert/strict");
const { Types } = require("mongoose");
const ProductReview = require("../models/ProductReview");
const { attachPublicProductRatings, formatPublicReviewDataForModel } = require("../services/productRatingService");

test("catalog ratings batch approved reviews by product identity and preserve products without ratings", async (t) => {
  const sharedId = new Types.ObjectId();
  const unratedId = new Types.ObjectId();
  const products = [
    { _id: sharedId, name: "Speaker", sourceType: "shop-product" },
    { _id: sharedId, name: "Cable", sourceCollection: "project-parts" },
    { _id: unratedId, name: "Bulb", sourceType: "shop-product" },
  ];
  const aggregate = t.mock.method(ProductReview, "aggregate", () => ({ option: async () => [
    { _id: { sourceType: "shop-product", productId: sharedId }, average: 4.5, total: 2 },
    { _id: { sourceType: "project-part", productId: sharedId }, average: 3, total: 1 },
  ] }));

  const result = await attachPublicProductRatings(products);
  assert.deepEqual(result.map(({ ratingSummary }) => ratingSummary), [
    { average: 4.5, total: 2 }, { average: 3, total: 1 }, { average: null, total: 0 },
  ]);
  assert.equal(aggregate.mock.callCount(), 1);
  const [pipeline] = aggregate.mock.calls[0].arguments;
  assert.equal(pipeline[0].$match.status, "approved");
  assert.deepEqual(pipeline[0].$match.$or, [
    { sourceType: "shop-product", productId: { $in: [sharedId, unratedId] } },
    { sourceType: "project-part", productId: { $in: [sharedId] } },
  ]);
  assert.equal(pipeline.length, 2);
});

test("AI context includes bounded approved excerpts and omits reviewer and order details", async (t) => {
  const productId = new Types.ObjectId();
  const item = { _id: productId, name: "Speaker", sourceType: "shop-product" };
  const aggregate = t.mock.method(ProductReview, "aggregate", () => ({ option: async () => [{
    _id: { sourceType: "shop-product", productId }, average: 14 / 3, total: 3,
    reviewExcerpts: [{ rating: 5, text: "Clear sound", reviewer: "Private name", orderId: "PEPRIVATE" }],
  }] }));
  const result = await attachPublicProductRatings([item], { includeReviews: true });
  const data = JSON.parse(formatPublicReviewDataForModel(result).split("\n")[1]);
  assert.deepEqual(data, [{ productName: "Speaker", source: "shop-product", average: 4.7, ratingCount: 3, excerpts: [{ rating: 5, text: "Clear sound" }] }]);
  const [pipeline] = aggregate.mock.calls[0].arguments;
  const lookup = pipeline[2].$lookup.pipeline;
  assert.equal(lookup[0].$match.status, "approved");
  assert.deepEqual(lookup[2], { $limit: 2 });
  assert.deepEqual(lookup[3], { $project: { _id: 0, rating: 1, text: { $substrCP: ["$review", 0, 180] } } });
});
