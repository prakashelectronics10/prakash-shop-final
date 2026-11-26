const { Types } = require("mongoose");
const { z } = require("zod");
const Order = require("../models/Order");
const ProductReview = require("../models/ProductReview");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { prepareReviewAlerts, wakeReviewAlerts } = require("../services/reviewWhatsAppService");
const { REVIEW_PAYMENT_STATES, INELIGIBLE_ORDER_STATES } = require("../services/orderProductReviewService");

const DUPLICATE_MESSAGE = "A review has already been submitted for this product using this Order ID.";
const sourceType = z.enum(["shop-product", "project-part"]);
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const productIdentity = z.object({ sourceType, productId: objectId });
const orderFields = z.object({ orderId: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,64}$/) });
const reviewFields = orderFields.extend({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(1200).default(""),
});
const pageNumber = z.string().regex(/^[1-9]\d{0,5}$/).default("1").transform(Number);
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const moderationStatus = z.enum(["approved", "declined"]);
const listFilters = z.object({
  page: pageNumber,
  status: z.enum(["pending", "approved", "declined"]).optional(),
  read: z.enum(["read", "unread"]).optional(),
  from: dateField.optional(),
  to: dateField.optional(),
  sourceType: sourceType.optional(),
  productId: objectId.optional(),
}).refine((query) => Boolean(query.sourceType) === Boolean(query.productId))
  .refine(({ from, to }) => !from || !to || from <= to);
const moderationFields = z.object({
  status: moderationStatus.optional(),
  read: z.boolean().optional(),
}).strict().refine(({ status, read }) => Boolean(status) !== (read !== undefined));
const newestFirst = { createdAt: -1, _id: -1 };

function parse(schema, value, message) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(message, 400);
  return result.data;
}

function identifyProduct(params) {
  const identity = parse(productIdentity, params, "Invalid product.");
  return { ...identity, productId: new Types.ObjectId(identity.productId) };
}

async function matchOrder(identity, orderId) {
  const order = await Order.findOne({
    orderId,
    paymentStatus: { $in: REVIEW_PAYMENT_STATES },
    orderStatus: { $nin: INELIGIBLE_ORDER_STATES },
    items: { $elemMatch: identity },
  }, { orderId: 1, items: { $elemMatch: identity } }).lean();
  if (!order?.items?.length) throw new AppError("We couldn’t verify this Order ID for this product. Check the ID on your order confirmation and try again.", 404);
  return order;
}

function reviewerDisplayName(name) {
  const parts = String(name || "").trim().split(/\s+/u);
  const first = parts[0];
  if (!/^\p{L}[\p{L}\p{M}.'’-]*$/u.test(first)) return "Customer";
  const initial = parts.length > 1 ? parts.at(-1).match(/^\p{L}/u)?.[0] : "";
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

exports.getPublicReviews = asyncHandler(async (req, res) => {
  const identity = identifyProduct(req.params);
  const page = parse(pageNumber, req.query.page, "Invalid review page.");
  const pageSize = 8;
  const [result] = await ProductReview.aggregate([
    { $match: { ...identity, status: "approved" } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $facet: {
      counts: [{ $group: { _id: "$rating", count: { $sum: 1 } } }],
      items: [
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        { $lookup: {
          from: Order.collection.name,
          localField: "order",
          foreignField: "_id",
          pipeline: [{ $project: { _id: 0, "customer.name": 1 } }],
          as: "reviewer",
        } },
        { $project: { _id: 1, rating: 1, review: 1, createdAt: 1, reviewerName: { $arrayElemAt: ["$reviewer.customer.name", 0] } } },
      ],
    } },
  ]);
  const counts = new Map((result?.counts || []).map(({ _id, count }) => [_id, count]));
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: counts.get(rating) || 0 }));
  const total = distribution.reduce((sum, row) => sum + row.count, 0);
  const points = distribution.reduce((sum, row) => sum + row.rating * row.count, 0);
  res.set("Cache-Control", "no-store").json({ success: true, data: {
    average: total ? points / total : null,
    total,
    distribution,
    items: (result?.items || []).map(({ _id, rating, review, createdAt, reviewerName }) => ({
      _id, rating, review, createdAt, displayName: reviewerDisplayName(reviewerName),
    })),
    hasMore: page * pageSize < total,
  } });
});

exports.verifyReviewOrder = asyncHandler(async (req, res) => {
  const identity = identifyProduct(req.params);
  const { orderId } = parse(orderFields, req.body, "Enter a valid Order ID.");
  const order = await matchOrder(identity, orderId);
  if (await ProductReview.exists({ ...identity, order: order._id })) throw new AppError(DUPLICATE_MESSAGE, 409);
  res.set("Cache-Control", "no-store").json({ success: true });
});

exports.submitReview = asyncHandler(async (req, res) => {
  const identity = identifyProduct(req.params);
  const { orderId, rating, review } = parse(reviewFields, req.body, "Enter a valid Order ID, choose a rating from 1 to 5, and keep your review within 1,200 characters.");
  const order = await matchOrder(identity, orderId);
  await ProductReview.ensureReviewIndexes();
  const alerts = await prepareReviewAlerts();
  try {
    await ProductReview.create({
      ...identity,
      order: order._id,
      orderId: order.orderId,
      productName: order.items[0].productName,
      rating,
      review,
      ...alerts,
    });
  } catch (error) {
    if (error?.code === 11000) throw new AppError(DUPLICATE_MESSAGE, 409);
    throw error;
  }
  res.status(201).set("Cache-Control", "no-store").json({ success: true });
  if (alerts.whatsappDeliveries?.length) void wakeReviewAlerts();
});

exports.listReviewProducts = asyncHandler(async (_req, res) => {
  const items = await ProductReview.aggregate([
    { $sort: newestFirst },
    { $group: { _id: { productId: "$productId", sourceType: "$sourceType" }, name: { $first: "$productName" } } },
    { $project: { _id: 0, productId: "$_id.productId", sourceType: "$_id.sourceType", name: 1 } },
    { $sort: { name: 1, sourceType: 1, productId: 1 } },
  ]);
  res.set("Cache-Control", "no-store").json({ success: true, data: items });
});

exports.listAdminReviews = asyncHandler(async (req, res) => {
  const { page, status, read, from, to, ...product } = parse(listFilters, req.query, "Invalid review filters. Check the product and date range.");
  const filter = product.productId ? identifyProduct(product) : {};
  const pageSize = 20;
  if (status) filter.status = status;
  if (read) filter.readAt = read === "unread" ? null : { $ne: null };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999+05:30`);
  }
  const [items, total] = await Promise.all([
    ProductReview.find(filter).select("productId sourceType productName orderId rating review status readAt createdAt")
      .sort(newestFirst).skip((page - 1) * pageSize).limit(pageSize).lean(),
    ProductReview.countDocuments(filter),
  ]);
  res.set("Cache-Control", "no-store").json({ success: true, data: { items, total, pages: Math.ceil(total / pageSize) } });
});

exports.updateReview = asyncHandler(async (req, res) => {
  const id = parse(objectId, req.params.id, "Invalid review.");
  const { status, read } = parse(moderationFields, req.body, "Choose a moderation or read status.");
  const now = new Date();
  const changes = status
    ? { status, readAt: now, moderatedAt: now, moderatedBy: req.admin._id }
    : { readAt: read ? now : null };
  const updated = await ProductReview.findByIdAndUpdate(id, { $set: changes, ...(status ? { $unset: { moderatedByWhatsAppRecipient: 1 } } : {}) });
  if (!updated) throw new AppError("Review not found.", 404);
  res.set("Cache-Control", "no-store").json({ success: true });
});
