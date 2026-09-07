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
const {
  createRazorpayOrder,
  getRazorpayPayment,
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
    additionalCharges: order.additionalCharges || [],
    deliveryCharge: order.deliveryCharge,
    total: order.total,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    placedAt: order.paidAt || order.createdAt,
    statusUpdatedAt: order.statusUpdatedAt,
  };
}

exports.createPaymentOrder = asyncHandler(async (req, res) => {
  const customer = sanitizeCustomer(req.body.customer);
  const items = await resolveOrderItems(req.body.items);
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const additionalCharges = await getOrderChargeSnapshots();
  const additionalChargesTotal = Number(additionalCharges.reduce((sum, charge) => sum + charge.amount, 0).toFixed(2));
  const deliveryCharge = additionalCharges.find((charge) => charge.slug === "delivery-charge")?.amount || 0;
  const total = Number((subtotal + additionalChargesTotal).toFixed(2));
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
      subtotal,
      total,
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
  if (order.paymentStatus === "paid") return res.json({ success: true, data: publicOrder(order) });
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
        && order.paymentStatus !== "paid"
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
  res.json({ success: true });
});

exports.getPublicOrder = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || "").trim().toUpperCase();
  const order = await Order.findOne({ orderId, paymentStatus: "paid" }).lean();
  if (!order) throw new AppError("No confirmed order was found with this Order ID", 404);
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: publicOrder(order) });
});

exports.listOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(10, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { paymentStatus: "paid" };
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
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { orderStatus, statusUpdatedAt: new Date() },
    { new: true, runValidators: true },
  ).lean();
  if (!order) throw new AppError("Order not found", 404);
  res.json({ success: true, data: order });
});

exports.ORDER_STATUSES = ORDER_STATUSES;
