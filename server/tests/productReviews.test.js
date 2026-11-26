const test = require("node:test");
const assert = require("node:assert/strict");
const { Types } = require("mongoose");
const Order = require("../models/Order");
const ProductReview = require("../models/ProductReview");
const ReviewWhatsAppSettings = require("../models/ReviewWhatsAppSettings");
const reviews = require("../controllers/productReviewController");
const { remainingOrderReviewProducts } = require("../services/orderProductReviewService");

const productId = "66b000000000000000000001";
const params = { sourceType: "shop-product", productId };
const order = {
  _id: new Types.ObjectId(),
  orderId: "PEABCDEF2345",
  items: [{ productName: "Bluetooth speaker" }],
};

function request(handler, input = {}) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      set() { return this; },
      json(payload) { resolve({ status: this.statusCode, ...payload }); },
    };
    handler({ params, query: {}, body: {}, ...input }, response, reject);
  });
}

test("verification matches the exact product and only eligible orders, then checks duplicates", async (t) => {
  const findOrder = t.mock.method(Order, "findOne", () => ({ lean: async () => order }));
  const exists = t.mock.method(ProductReview, "exists", async () => null);
  const input = { body: { orderId: " peabcdef2345 " } };
  assert.equal((await request(reviews.verifyReviewOrder, input)).success, true);
  const [filter, projection] = findOrder.mock.calls[0].arguments;
  assert.equal(filter.orderId, order.orderId);
  assert.deepEqual(filter.paymentStatus.$in, ["paid", "cod"]);
  assert.deepEqual(filter.orderStatus.$nin, ["awaiting_payment", "cancelled"]);
  assert.equal(filter.items.$elemMatch.productId.toString(), productId);
  assert.equal(filter.items.$elemMatch.sourceType, "shop-product");
  assert.deepEqual(projection, { orderId: 1, items: { $elemMatch: filter.items.$elemMatch } });
  assert.equal(exists.mock.calls[0].arguments[0].order, order._id);
  exists.mock.mockImplementation(async () => ({ _id: new Types.ObjectId() }));
  await assert.rejects(request(reviews.verifyReviewOrder, input), { statusCode: 409, message: /already been submitted/ });
});

test("submission rechecks eligibility and persists only a valid pending review", async (t) => {
  t.mock.method(ReviewWhatsAppSettings, "findById", () => ({ lean: async () => null }));
  const findOrder = t.mock.method(Order, "findOne", () => ({ lean: async () => null }));
  const prepare = t.mock.method(ProductReview, "ensureReviewIndexes", async () => {});
  const create = t.mock.method(ProductReview, "create", async () => {});
  const input = { body: { orderId: order.orderId, rating: 4, review: "  Worked well.  ", status: "approved" } };
  await assert.rejects(request(reviews.submitReview, input), { statusCode: 404 });
  await assert.rejects(request(reviews.submitReview, { body: { ...input.body, rating: 4.5 } }), { statusCode: 400 });
  assert.equal(create.mock.callCount(), 0);
  findOrder.mock.mockImplementation(() => ({ lean: async () => order }));
  assert.equal((await request(reviews.submitReview, input)).status, 201);
  assert.equal(prepare.mock.callCount(), 1);
  const [review] = create.mock.calls[0].arguments;
  assert.equal(review.review, "Worked well.");
  assert.equal(review.productName, order.items[0].productName);
  assert.equal(new ProductReview(review).status, "pending");
  assert.ok(ProductReview.schema.indexes().some(([keys, options]) => (
    keys.order === 1 && keys.sourceType === 1 && keys.productId === 1 && options.unique
  )));
  create.mock.mockImplementation(async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); });
  await assert.rejects(request(reviews.submitReview, input), { statusCode: 409, message: /already been submitted/ });
});

test("public summary orders approved cards by submission time and calculates the overall rating", async (t) => {
  const createdAt = new Date();
  const earlierCreatedAt = new Date(createdAt.getTime() - 60_000);
  const reviewId = new Types.ObjectId();
  const earlierReviewId = new Types.ObjectId();
  const items = [
    { _id: earlierReviewId, rating: 2, review: "", createdAt: earlierCreatedAt },
    { _id: reviewId, rating: 5, review: "Excellent", createdAt, reviewerName: "Aarav Kumar Sharma", orderId: "PEPRIVATE" },
  ];
  const aggregate = t.mock.method(ProductReview, "aggregate", async () => [{ counts: [{ _id: 5, count: 2 }, { _id: 2, count: 1 }], items }]);
  const { data } = await request(reviews.getPublicReviews);
  assert.equal(data.average, 4);
  assert.equal(data.total, 3);
  assert.deepEqual(data.distribution.map(({ count }) => count), [2, 0, 0, 1, 0]);
  assert.deepEqual(data.items, [
    { _id: earlierReviewId, rating: 2, review: "", createdAt: earlierCreatedAt, displayName: "Customer" },
    { _id: reviewId, rating: 5, review: "Excellent", createdAt, displayName: "Aarav S." },
  ]);
  const [pipeline] = aggregate.mock.calls[0].arguments;
  assert.equal(pipeline[0].$match.status, "approved");
  assert.deepEqual(pipeline[1].$sort, { createdAt: 1, _id: 1 });
  const itemStages = pipeline[2].$facet.items;
  assert.deepEqual(itemStages[2].$lookup.pipeline, [{ $project: { _id: 0, "customer.name": 1 } }]);
  assert.equal(itemStages[2].$lookup.localField, "order");
  assert.deepEqual(Object.keys(itemStages[3].$project), ["_id", "rating", "review", "createdAt", "reviewerName"]);
  aggregate.mock.mockImplementation(async () => [{ counts: [], items: [] }]);
  assert.equal((await request(reviews.getPublicReviews)).data.average, null);
});

test("admin filters combine product, status, unread and the inclusive India date range", async (t) => {
  const results = { select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] };
  const find = t.mock.method(ProductReview, "find", () => results);
  t.mock.method(ProductReview, "countDocuments", async () => 0);
  await request(reviews.listAdminReviews, {
    query: { ...params, status: "pending", read: "unread", from: "2026-11-26", to: "2026-11-26" },
  });
  const [filter] = find.mock.calls[0].arguments;
  assert.equal(filter.productId.toString(), productId);
  assert.equal(filter.status, "pending");
  assert.equal(filter.readAt, null);
  assert.equal(filter.createdAt.$gte.toISOString(), "2026-11-25T18:30:00.000Z");
  assert.equal(filter.createdAt.$lte.toISOString(), "2026-11-26T18:29:59.999Z");
  await assert.rejects(request(reviews.listAdminReviews, { query: { from: "2026-02-30" } }), { statusCode: 400 });
});

test("approving or declining marks the review read while read-only actions leave moderation alone", async (t) => {
  const update = t.mock.method(ProductReview, "findByIdAndUpdate", async () => ({}));
  const admin = { _id: new Types.ObjectId() };
  const input = { params: { id: productId }, admin };
  await request(reviews.updateReview, { ...input, body: { status: "approved" } });
  await request(reviews.updateReview, { ...input, body: { status: "declined" } });
  await request(reviews.updateReview, { ...input, body: { read: false } });
  assert.equal(update.mock.calls[0].arguments[1].$set.status, "approved");
  assert.equal(update.mock.calls[1].arguments[1].$set.status, "declined");
  assert.equal(update.mock.calls[0].arguments[1].$set.moderatedBy, admin._id);
  assert.ok(update.mock.calls[1].arguments[1].$set.readAt instanceof Date);
  assert.deepEqual(update.mock.calls[2].arguments[1].$set, { readAt: null });
});

test("checkout and tracking show each eligible product once and exclude submitted reviews", async (t) => {
  const orderId = new Types.ObjectId();
  const speaker = { sourceType: "shop-product", productId, productName: "Speaker", productImageUrl: "/speaker.png" };
  const cable = { sourceType: "project-part", productId: new Types.ObjectId(), productName: "Cable" };
  const paid = { _id: orderId, orderId: "PEPAID", paymentStatus: "paid", orderStatus: "confirmed", items: [speaker, { ...speaker, variantCombinationId: "blue" }, cable] };
  const unpaid = { ...paid, _id: new Types.ObjectId(), orderId: "PEUNPAID", paymentStatus: "pending", orderStatus: "awaiting_payment" };
  const find = t.mock.method(ProductReview, "find", () => ({ select() { return this; }, lean: async () => [{ order: orderId, ...cable }] }));
  const result = await remainingOrderReviewProducts([paid, unpaid]);
  assert.deepEqual(result.get("PEPAID"), [speaker]);
  assert.equal(result.has("PEUNPAID"), false);
  assert.deepEqual(find.mock.calls[0].arguments[0].order.$in, [orderId]);
});
