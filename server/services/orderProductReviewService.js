const ProductReview = require("../models/ProductReview");
const { logger } = require("../utils/logger");

const REVIEW_PAYMENT_STATES = ["paid", "cod"];
const INELIGIBLE_ORDER_STATES = ["awaiting_payment", "cancelled"];

function reviewProductKey(item) {
  return `${item.sourceType}:${item.productId}`;
}

function orderReviewProducts(order) {
  const unique = new Map();
  for (const item of order.items || []) {
    if (!item.productId || !["shop-product", "project-part"].includes(item.sourceType)) continue;
    const key = reviewProductKey(item);
    if (!unique.has(key)) unique.set(key, {
      productId: item.productId,
      sourceType: item.sourceType,
      productName: item.productName,
      productImageUrl: item.productImageUrl,
    });
  }
  return [...unique.values()];
}

async function remainingOrderReviewProducts(orders) {
  const eligible = orders.filter((order) => REVIEW_PAYMENT_STATES.includes(order.paymentStatus)
    && !INELIGIBLE_ORDER_STATES.includes(order.orderStatus));
  if (!eligible.length) return new Map();
  const submitted = await ProductReview.find({ order: { $in: eligible.map((order) => order._id) } })
    .select("order productId sourceType").lean().catch((error) => {
      logger.warn("order.review_eligibility_unavailable", { code: error.code });
      return null;
    });
  if (!submitted) return new Map();
  const submittedKeys = new Set(submitted.map((item) => `${item.order}:${reviewProductKey(item)}`));
  return new Map(eligible.map((order) => [order.orderId, orderReviewProducts(order)
    .filter((product) => !submittedKeys.has(`${order._id}:${reviewProductKey(product)}`))]));
}

module.exports = { REVIEW_PAYMENT_STATES, INELIGIBLE_ORDER_STATES, orderReviewProducts, remainingOrderReviewProducts };
