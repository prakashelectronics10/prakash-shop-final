const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { availableStockQuantity } = require("../utils/inventory");
const { resolveProductPricing } = require("../utils/productPricing");
const env = require("../config/env");
const { getOrderChargeSnapshots } = require("../services/additionalChargeService");
const { priceOrderCoupons } = require("../services/couponService");
const {
  createRazorpayOrder,
  getRazorpayPayment,
  refundRazorpayPayment,
  getRazorpayPaymentRefunds,
  verifyPaymentSignature,
  verifyWebhookSignature,
} = require("../services/razorpayService");

const ORDER_STATUSES = ["confirmed", "shipped", "out_for_delivery", "delivered", "cancelled"];

function cleanText(value, maxLength, required = false) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (required && !text) throw new AppError("Please complete all required delivery details", 400);
  if (text.length > maxLength) throw new AppError(`A field exceeds the ${maxLength} character limit`, 400);
  return text;
}

function sanitizeCustomer(input = {}) {
  const customer = {
    name: cleanText(input.name, 100, true),
    phone: cleanText(input.phone, 15, true).replace(/[^\d+]/g, ""),
    address: cleanText(input.address, 500, true),
    pincode: cleanText(input.pincode, 6, true),
    landmark: cleanText(input.landmark, 160),
    message: cleanText(input.message, 1000),
  };
  if (!/^(?:\+91)?[6-9]\d{9}$/.test(customer.phone)) throw new AppError("Enter a valid Indian phone number", 400);
  if (!/^\d{6}$/.test(customer.pincode)) throw new AppError("Pincode must contain exactly 6 digits", 400);
  return customer;
}

function productQuery(item = {}) {
  const clauses = [];
  const sourceId = String(item.sourceId || item.productId || "").trim();
  const slug = String(item.productSlug || "").trim().toLowerCase();
  if (sourceId && mongoose.Types.ObjectId.isValid(sourceId)) clauses.push({ _id: sourceId });
  if (slug) clauses.push({ slug });
  if (sourceId && !mongoose.Types.ObjectId.isValid(sourceId)) clauses.push({ slug: sourceId.toLowerCase() });
  return clauses.length ? { $or: clauses, isActive: true } : { _id: null };
}

async function resolveOrderItems(rawItems = []) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 50) {
    throw new AppError("Your cart must contain between 1 and 50 products", 400);
  }

  return Promise.all(rawItems.map(async (item) => {
    const isProjectPart = String(item.sourceType || "").toLowerCase().includes("project");
    const Model = isProjectPart ? ProjectPart : ShopProduct;
    const product = await Model.findOne(productQuery(item)).lean();
    if (!product) throw new AppError("A product in your cart is no longer available", 409);
    const quantity = Math.min(99, Math.max(1, Number.parseInt(item.quantity, 10) || 1));
    const stock = availableStockQuantity(product, isProjectPart ? "stock" : "quantity");
    if (stock < quantity) throw new AppError(`${product.name} has only ${stock} item${stock === 1 ? "" : "s"} available`, 409);
    const unitPrice = resolveProductPricing(product).price;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new AppError(`${product.name} does not have an online purchase price`, 409);
    return {
      sourceType: isProjectPart ? "project-part" : "shop-product",
      productId: product._id,
      productSlug: product.slug || "",
      productName: product.name,
      productCategory: product.category || (isProjectPart ? "Wiring Accessories" : "Electronics"),
      productImageUrl: product.imageUrl || product.images?.[0]?.url || "",
      unitPrice,
      quantity,
      lineTotal: Number((unitPrice * quantity).toFixed(2)),
    };
  }));
}

async function buildOrderQuote(rawItems, couponCode = "") {
  const resolvedItems = await resolveOrderItems(rawItems);
  const items = await priceOrderCoupons(resolvedItems, rawItems, couponCode);
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const discountedSubtotal = Number(items.reduce((sum, item) => sum + item.discountedLineTotal, 0).toFixed(2));
  const discountTotal = Number((subtotal - discountedSubtotal).toFixed(2));
  const additionalCharges = await getOrderChargeSnapshots();
  const additionalChargesTotal = Number(additionalCharges.reduce((sum, charge) => sum + charge.amount, 0).toFixed(2));
  const deliveryCharge = additionalCharges.find((charge) => charge.slug === "delivery-charge")?.amount || 0;
  const applied = items.filter((item) => item.coupon);
  const coupon = new Set(applied.map((item) => item.couponCode)).size === 1
    ? { ...applied[0].coupon, discountAmount: discountTotal } : null;
  const total = Number((discountedSubtotal + additionalChargesTotal).toFixed(2));
  return { items, subtotal, discountedSubtotal, coupon, discountTotal, additionalCharges, additionalChargesTotal, deliveryCharge, total };
}

function newPublicOrderId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PE-${date}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

function publicOrder(order) {
  return {
    orderId: order.orderId,
    customerName: order.customer?.name || "Customer",
    items: order.items,
    itemCount: order.itemCount,
    subtotal: order.subtotal,
    coupon: order.coupon || null,
    discountTotal: order.discountTotal || 0,
    additionalCharges: order.additionalCharges || [],
    deliveryCharge: order.deliveryCharge,
    total: order.total,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    placedAt: order.paidAt || order.createdAt,
    statusUpdatedAt: order.statusUpdatedAt,
    cancellationRequest: {
      status: order.cancellationRequest?.status || "none",
      reason: order.cancellationRequest?.reason || "",
      requestedAt: order.cancellationRequest?.requestedAt || null,
      resolvedAt: order.cancellationRequest?.resolvedAt || null,
      adminNote: order.cancellationRequest?.adminNote || "",
    },
    refund: {
      status: order.refund?.status || "not_required",
      amount: order.refund?.amount || 0,
      initiatedAt: order.refund?.initiatedAt || null,
      completedAt: order.refund?.completedAt || null,
    },
  };
}

exports.createPaymentOrder = asyncHandler(async (req, res) => {
  const customer = sanitizeCustomer(req.body.customer);
  const { items, subtotal, discountedSubtotal, coupon, discountTotal, additionalCharges, deliveryCharge, total } = await buildOrderQuote(req.body.items, req.body.couponCode);
  if (total < 1) throw new AppError("Online payment requires an order total of at least Rs. 1. Please contact the shop for this order.", 400);
  const orderId = newPublicOrderId();
  const razorpayOrder = await createRazorpayOrder({
    amount: Math.round(total * 100),
    receipt: orderId.slice(0, 40),
    notes: { internalOrderId: orderId, customerName: customer.name, phone: customer.phone },
  });
  const order = await Order.create({
    orderId,
    customer,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    coupon,
    discountTotal,
    additionalCharges,
    deliveryCharge,
    total,
    razorpayOrderId: razorpayOrder.id,
  });

  res.status(201).json({
    success: true,
    data: {
      orderId: order.orderId,
      razorpayOrderId: razorpayOrder.id,
      keyId: env.razorpay.keyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      customer: { name: customer.name, phone: customer.phone },
      additionalCharges,
      items,
      subtotal,
      discountedSubtotal,
      coupon,
      discountTotal,
      total,
    },
  });
});

exports.getOrderQuote = asyncHandler(async (req, res) => {
  const quote = await buildOrderQuote(req.body.items, req.body.couponCode);
  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    data: {
      items: quote.items,
      subtotal: quote.subtotal,
      discountedSubtotal: quote.discountedSubtotal,
      coupon: quote.coupon,
      discountTotal: quote.discountTotal,
      additionalCharges: quote.additionalCharges,
      total: quote.total,
    },
  });
});

exports.verifyPayment = asyncHandler(async (req, res) => {
  const orderId = String(req.body.orderId || "").trim().toUpperCase();
  const razorpayOrderId = String(req.body.razorpayOrderId || "").trim();
  const razorpayPaymentId = String(req.body.razorpayPaymentId || "").trim();
  const signature = String(req.body.razorpaySignature || "").trim();
  const order = await Order.findOne({ orderId });
  if (!order || order.razorpayOrderId !== razorpayOrderId) throw new AppError("Order verification failed", 400);
  if (["paid", "refunded"].includes(order.paymentStatus)) return res.json({ success: true, data: publicOrder(order) });
  if (!verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
    order.paymentStatus = "failed";
    await order.save();
    throw new AppError("Payment signature could not be verified", 400);
  }
  const payment = await getRazorpayPayment(razorpayPaymentId);
  const validProviderPayment = payment.order_id === razorpayOrderId
    && payment.currency === "INR"
    && Number(payment.amount) === Math.round(order.total * 100)
    && ["captured", "authorized"].includes(payment.status);
  if (!validProviderPayment) throw new AppError("Payment details do not match this order", 400);

  order.paymentStatus = "paid";
  order.orderStatus = "confirmed";
  order.razorpayPaymentId = razorpayPaymentId;
  order.paidAt = new Date();
  order.statusUpdatedAt = new Date();
  await order.save();
  res.json({ success: true, data: publicOrder(order) });
});

exports.handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.get("x-razorpay-signature");
  if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, signature)) {
    throw new AppError("Invalid Razorpay webhook signature", 400);
  }
  const event = JSON.parse(req.body.toString("utf8"));
  if (event.event === "payment.captured") {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id && payment?.id) {
      const order = await Order.findOne({ razorpayOrderId: payment.order_id });
      if (
        order
        && payment.currency === "INR"
        && Number(payment.amount) === Math.round(order.total * 100)
        && !["paid", "refunded"].includes(order.paymentStatus)
      ) {
        order.paymentStatus = "paid";
        order.orderStatus = "confirmed";
        order.razorpayPaymentId = payment.id;
        order.paidAt = payment.created_at ? new Date(payment.created_at * 1000) : new Date();
        order.statusUpdatedAt = new Date();
        await order.save();
      }
    }
  }
  if (["refund.processed", "refund.failed"].includes(event.event)) {
    const refund = event.payload?.refund?.entity;
    if (refund?.payment_id) {
      const processed = event.event === "refund.processed";
      await Order.findOneAndUpdate(
        {
          razorpayPaymentId: refund.payment_id,
          $or: [
            { "refund.providerRefundId": refund.id },
            { "refund.providerRefundId": "" },
          ],
        },
        {
          $set: {
            "refund.providerRefundId": String(refund.id || ""),
            "refund.status": processed ? "processed" : "failed",
            "refund.amount": Number(refund.amount || 0) / 100,
            "refund.completedAt": processed ? new Date() : null,
            "refund.failureMessage": processed ? "" : String(refund.error_description || "Refund processing failed").slice(0, 300),
            ...(processed ? { paymentStatus: "refunded" } : {}),
          },
        },
      );
    }
  }
  res.json({ success: true });
});

exports.getPublicOrder = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || "").trim().toUpperCase();
  const order = await Order.findOne({ orderId, paymentStatus: { $in: ["paid", "refunded"] } }).lean();
  if (!order) throw new AppError("No confirmed order was found with this Order ID", 404);
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: publicOrder(order) });
});

exports.requestOrderCancellation = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || "").trim().toUpperCase();
  const phone = cleanText(req.body.phone, 15, true).replace(/[^\d]/g, "").slice(-10);
  const reason = cleanText(req.body.reason, 500, true);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new AppError("Enter the 10-digit phone number used for this order", 400);

  const order = await Order.findOne({ orderId, paymentStatus: "paid" });
  if (!order || String(order.customer?.phone || "").replace(/[^\d]/g, "").slice(-10) !== phone) {
    throw new AppError("Order ID and phone number do not match", 404);
  }
  if (order.orderStatus !== "confirmed") {
    throw new AppError("Cancellation is only available before an order is shipped", 409);
  }
  if (["requested", "processing", "accepted"].includes(order.cancellationRequest?.status)) {
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: publicOrder(order) });
  }
  order.cancellationRequest = {
    status: "requested",
    reason,
    requestedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    adminNote: "",
  };
  await order.save();
  res.set("Cache-Control", "no-store");
  return res.status(201).json({ success: true, data: publicOrder(order) });
});

exports.listOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(10, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { paymentStatus: { $in: ["paid", "refunded"] } };
  const search = String(req.query.search || "").trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { orderId: { $regex: escaped, $options: "i" } },
      { "customer.name": { $regex: escaped, $options: "i" } },
      { "customer.phone": { $regex: escaped, $options: "i" } },
      { razorpayPaymentId: { $regex: escaped, $options: "i" } },
    ];
  }
  if (req.query.from || req.query.to) {
    filter.paidAt = {};
    if (req.query.from) filter.paidAt.$gte = new Date(`${req.query.from}T00:00:00.000Z`);
    if (req.query.to) filter.paidAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ paidAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit), hasMore: page * limit < total } });
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const orderStatus = String(req.body.orderStatus || "").trim();
  if (!ORDER_STATUSES.includes(orderStatus)) throw new AppError("Invalid order status", 400);
  const update = { orderStatus, statusUpdatedAt: new Date() };
  if (orderStatus !== "confirmed") {
    update["cancellationRequest.status"] = "rejected";
    update["cancellationRequest.resolvedAt"] = new Date();
    update["cancellationRequest.adminNote"] = "Order fulfilment had already progressed.";
  }
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true },
  ).lean();
  if (!order) throw new AppError("Order not found", 404);
  res.json({ success: true, data: order });
});

exports.resolveOrderCancellation = asyncHandler(async (req, res) => {
  const decision = String(req.body.decision || "").trim().toLowerCase();
  const adminNote = cleanText(req.body.adminNote, 500);
  if (!["accept", "reject"].includes(decision)) throw new AppError("Choose accept or reject", 400);

  if (decision === "reject") {
    const rejected = await Order.findOneAndUpdate(
      { _id: req.params.id, "cancellationRequest.status": "requested" },
      {
        $set: {
          "cancellationRequest.status": "rejected",
          "cancellationRequest.resolvedAt": new Date(),
          "cancellationRequest.resolvedBy": req.admin?._id,
          "cancellationRequest.adminNote": adminNote || "Cancellation request was not approved.",
        },
      },
      { new: true, runValidators: true },
    ).lean();
    if (!rejected) throw new AppError("This cancellation request is no longer pending", 409);
    return res.json({ success: true, data: rejected });
  }

  const order = await Order.findOneAndUpdate(
    {
      _id: req.params.id,
      paymentStatus: "paid",
      orderStatus: "confirmed",
      "cancellationRequest.status": "requested",
    },
    {
      $set: {
        "cancellationRequest.status": "processing",
        "cancellationRequest.resolvedBy": req.admin?._id,
        "cancellationRequest.adminNote": adminNote,
        "refund.status": "processing",
        "refund.amount": 0,
        "refund.initiatedAt": new Date(),
        "refund.failureMessage": "",
      },
    },
    { new: true, runValidators: true },
  );
  if (!order) throw new AppError("Only a paid, confirmed order with a pending request can be cancelled", 409);

  try {
    if (!order.razorpayPaymentId) throw new AppError("This order has no verified payment ID", 409);
    const receipt = `cancel-${String(order._id)}`;
    const existingRefunds = await getRazorpayPaymentRefunds(order.razorpayPaymentId).catch(() => null);
    const existingProviderRefund = existingRefunds?.items?.find((item) => item.receipt === receipt || item.notes?.orderId === order.orderId);
    const providerRefund = existingProviderRefund || await refundRazorpayPayment(order.razorpayPaymentId, {
      amount: Math.round(Number(order.total) * 100),
      receipt,
      notes: { orderId: order.orderId, reason: order.cancellationRequest.reason.slice(0, 240) },
    });
    const completed = providerRefund.status === "processed";
    order.orderStatus = "cancelled";
    order.statusUpdatedAt = new Date();
    order.cancellationRequest.status = "accepted";
    order.cancellationRequest.resolvedAt = new Date();
    order.refund.status = completed ? "processed" : "processing";
    order.refund.providerRefundId = String(providerRefund.id || "");
    order.refund.amount = Number(providerRefund.amount || Math.round(Number(order.total) * 100)) / 100;
    if (completed) {
      order.paymentStatus = "refunded";
      order.refund.completedAt = new Date();
    }
    await order.save();
    return res.json({ success: true, data: order.toObject() });
  } catch (error) {
    const knownProviderRejection = error instanceof AppError && Number(error.statusCode) < 500;
    await Order.updateOne({ _id: order._id, "cancellationRequest.status": "processing" }, {
      $set: {
        ...(knownProviderRejection ? { "cancellationRequest.status": "requested", "refund.status": "failed" } : {}),
        "refund.failureMessage": knownProviderRejection
          ? String(error.message || "Refund initiation failed").slice(0, 300)
          : "Refund request outcome is awaiting Razorpay webhook verification. Check the Razorpay dashboard before retrying.",
      },
    });
    throw error;
  }
});

exports.ORDER_STATUSES = ORDER_STATUSES;
exports.buildOrderQuote = buildOrderQuote;
