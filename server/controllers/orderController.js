const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { availableStockQuantity } = require("../utils/inventory");
const { resolveProductPricing } = require("../utils/productPricing");
const {
  assertOrderableVariant,
  productHasVariants,
} = require("../utils/productVariants");
const env = require("../config/env");
const { getOrderChargeSnapshots } = require("../services/additionalChargeService");
const { priceOrderCoupons } = require("../services/couponService");
const {
  createRazorpayOrder,
  getRazorpayPayment,
  getRazorpayOrderPayments,
  verifyPaymentSignature,
  verifyWebhookSignature,
} = require("../services/razorpayService");
const { enqueueOrderPaidNotification } = require("../services/orderNotificationService");
const {
  sendPaymentUnsuccessfulWhatsApp,
  sendOrderShipmentWhatsApp,
} = require("../services/whatsappTransactionalService");
const { logger } = require("../utils/logger");
const Invoice = require("../models/Invoice");
const { createOrderInvoice, getOrderInvoicePdf, orderInvoicePath } = require("../services/orderInvoiceService");
const { verifiedOrderHistoryNumber } = require("../services/customerWhatsAppOtpService");
const { orderReviewProducts, remainingOrderReviewProducts, REVIEW_PAYMENT_STATES } = require("../services/orderProductReviewService");

const ORDER_STATUSES = ["confirmed", "shipped", "out_for_delivery", "delivered"];

function cleanText(value, maxLength, required = false) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (required && !text) throw new AppError("Please complete all required delivery details", 400);
  if (text.length > maxLength) throw new AppError(`A field exceeds the ${maxLength} character limit`, 400);
  return text;
}

function normalizeTenDigitPhone(raw) {
  const digitsOnly = String(raw || "").replace(/\D/g, "");
  return digitsOnly.length === 12 && digitsOnly.startsWith("91")
    ? digitsOnly.slice(2)
    : digitsOnly;
}

function sanitizeCustomer(input = {}) {
  const phone = normalizeTenDigitPhone(input.phone);
  const whatsappNumber = normalizeTenDigitPhone(input.whatsappNumber || input.whatsapp || input.phone);
  const customer = {
    name: cleanText(input.name, 100, true),
    phone: cleanText(phone, 10, true),
    whatsappNumber: cleanText(whatsappNumber, 10, true),
    address: cleanText(input.address, 500, true),
    pincode: cleanText(input.pincode, 6, true),
    landmark: cleanText(input.landmark, 160),
    message: cleanText(input.message, 1000),
  };
  if (!/^[6-9]\d{9}$/.test(customer.phone)) throw new AppError("Enter a valid 10-digit Indian phone number", 400);
  if (!/^[6-9]\d{9}$/.test(customer.whatsappNumber)) {
    throw new AppError("Enter a valid 10-digit WhatsApp number", 400);
  }
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

const { catalogRetailerId } = require("../services/metaCatalogMapper");

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
    const combinationId = item.variantCombinationId || item.combinationId || "";
    const optionIds = item.variantOptionIds || item.optionIds || [];

    if (productHasVariants(product)) {
      let variant;
      try {
        variant = assertOrderableVariant(product, {
          combinationId,
          optionIds,
          quantity,
        });
      } catch (error) {
        throw new AppError(error.message || "Selected variant is unavailable", error.statusCode || 409);
      }
      return {
        sourceType: isProjectPart ? "project-part" : "shop-product",
        productId: product._id,
        productSlug: product.slug || "",
        productName: product.name,
        productCategory: product.category || (isProjectPart ? "Wiring Accessories" : "Electronics"),
        productImageUrl: variant.imageUrl || product.imageUrl || product.images?.[0]?.url || "",
        unitPrice: variant.pricing.price,
        quantity,
        lineTotal: Number((variant.pricing.price * quantity).toFixed(2)),
        retailerId: catalogRetailerId(product, variant.combination),
        variantCombinationId: variant.combination.id,
        variantSku: variant.sku,
        variantSummary: variant.summary,
        variantSelections: variant.selections,
      };
    }

    if (combinationId || optionIds.length) {
      throw new AppError(`${product.name} has changed. Please remove the old variant from your cart and select the product again.`, 409);
    }
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
      retailerId: catalogRetailerId(product),
      variantCombinationId: "",
      variantSku: "",
      variantSummary: "",
      variantSelections: [],
    };
  }));
}

async function buildOrderQuote(rawItems, couponCode = "") {
  const resolvedItems = await resolveOrderItems(rawItems);
  const items = await priceOrderCoupons(resolvedItems, rawItems, couponCode);
  const subtotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const discountedSubtotal = Number(items.reduce((sum, item) => sum + item.discountedLineTotal, 0).toFixed(2));
  const discountTotal = Number((subtotal - discountedSubtotal).toFixed(2));
  const additionalCharges = await getOrderChargeSnapshots(subtotal);
  const additionalChargesTotal = Number(additionalCharges.reduce((sum, charge) => sum + charge.amount, 0).toFixed(2));
  const deliveryCharge = additionalCharges.find((charge) => charge.slug === "delivery-charge")?.amount || 0;
  const applied = items.filter((item) => item.coupon);
  const coupon = new Set(applied.map((item) => item.couponCode)).size === 1
    ? { ...applied[0].coupon, discountAmount: discountTotal } : null;
  const total = Number((discountedSubtotal + additionalChargesTotal).toFixed(2));
  return { items, subtotal, discountedSubtotal, coupon, discountTotal, additionalCharges, additionalChargesTotal, deliveryCharge, total };
}

function newPublicOrderId() {
  // Short, typeable and unambiguous: no punctuation and no visually-confusing 0/O or 1/I.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let suffix = "";
  bytes.forEach((byte) => {
    suffix += alphabet[byte & 31];
  });
  return `PE${suffix}`;
}

function publicOrder(order) {
  const customer = order.customer || {};
  return {
    orderId: order.orderId,
    invoiceDownloadUrl: ["paid", "refunded"].includes(order.paymentStatus) ? orderInvoicePath(order.orderId) : "",
    customerName: customer.name || "Customer",
    customer: {
      name: customer.name || "Customer",
      phone: customer.phone || "",
      whatsappNumber: customer.whatsappNumber || customer.phone || "",
      address: customer.address || "",
      pincode: customer.pincode || "",
      landmark: customer.landmark || "",
      message: customer.message || "",
    },
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
    paymentMethod: order.paymentMethod || "online",
    source: order.source || "website",
    orderStatus: order.orderStatus,
    placedAt: order.paidAt || order.createdAt,
    statusUpdatedAt: order.statusUpdatedAt,
    refund: {
      status: order.refund?.status || "not_required",
      amount: order.refund?.amount || 0,
      initiatedAt: order.refund?.initiatedAt || null,
      completedAt: order.refund?.completedAt || null,
    },
  };
}

const RETRYABLE_PAYMENT_STATES = ["pending", "failed"];

function paymentMatches(order, payment) {
  return Boolean(payment?.id && payment.order_id === order.razorpayOrderId
    && payment.currency === "INR" && Number(payment.amount) === Math.round(order.total * 100));
}

async function confirmCapturedOrder(order, payment) {
  const now = new Date();
  const confirmed = await Order.findOneAndUpdate({
    _id: order._id, razorpayOrderId: order.razorpayOrderId,
    paymentStatus: { $in: RETRYABLE_PAYMENT_STATES }, orderStatus: "awaiting_payment",
  }, { $set: {
    paymentStatus: "paid", orderStatus: "confirmed", razorpayPaymentId: payment.id, paidAt: now,
    invoiceWhatsAppNextAttemptAt: now, statusUpdatedAt: now,
  } }, { new: true });
  if (confirmed) {
    enqueueOrderPaidNotification(confirmed);
    void createOrderInvoice(confirmed).catch((error) => {
      logger.error("order.invoice_create_failed", { orderId: confirmed.orderId, message: error.message });
    });
  }
  return confirmed || await Order.findById(order._id);
}

async function reconcileOrderPayment(order) {
  if (!RETRYABLE_PAYMENT_STATES.includes(order.paymentStatus) || !order.razorpayOrderId) {
    return { order, processing: false, failed: false };
  }
  const payments = await getRazorpayOrderPayments(order.razorpayOrderId);
  if (!Array.isArray(payments.items)) throw new AppError("Payment status could not be verified.", 502);
  const attempts = payments.items.filter((payment) => payment?.order_id === order.razorpayOrderId);
  const matching = attempts.filter((payment) => paymentMatches(order, payment));
  const captured = matching.find((payment) => payment.status === "captured");
  if (captured) return { order: await confirmCapturedOrder(order, captured), processing: false, failed: false };
  return {
    order,
    processing: attempts.some((payment) => ["authorized", "created", "captured"].includes(payment.status)),
    failed: matching.some((payment) => payment.status === "failed"),
  };
}

async function findCheckoutPayment(body) {
  const orderId = String(body.orderId || "").trim().toUpperCase();
  const razorpayOrderId = String(body.razorpayOrderId || "").trim();
  if (!orderId || !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId)) throw new AppError("Payment session not found", 404);
  const order = await Order.findOne({ orderId, razorpayOrderId });
  if (!order) throw new AppError("Payment session not found", 404);
  return order;
}

async function publicOrderWithReviews(order) {
  const products = await remainingOrderReviewProducts([order]);
  return { ...publicOrder(order), reviewItems: products.get(order.orderId) || [] };
}

async function paymentState(res, order, processing = false) {
  res.set("Cache-Control", "no-store");
  return res.json({ success: true, data: {
    orderId: order.orderId, paymentStatus: order.paymentStatus, processing,
    order: ["paid", "refunded"].includes(order.paymentStatus) ? await publicOrderWithReviews(order) : undefined,
  } });
}

exports.getCheckoutPaymentStatus = asyncHandler(async (req, res) => {
  const { order, processing } = await reconcileOrderPayment(await findCheckoutPayment(req.body));
  if (req.body.resume === true && !processing && RETRYABLE_PAYMENT_STATES.includes(order.paymentStatus)) {
    if (order.orderStatus !== "awaiting_payment") throw new AppError("This order is no longer eligible for payment.", 409);
    await resolveOrderItems(order.items);
  }
  return paymentState(res, order, processing);
});

async function ownedOrderFilter(body) {
  const number = await verifiedOrderHistoryNumber(body);
  return { "customer.whatsappNumber": { $in: [number, `91${number}`, `+91${number}`] } };
}

exports.getCustomerOrders = asyncHandler(async (req, res) => {
  const filter = await ownedOrderFilter(req.body);
  const cursor = String(req.body.cursor || "");
  if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) throw new AppError("Invalid order history cursor", 400);
  if (cursor) filter._id = { $lt: cursor };
  const limit = 20;
  const orders = await Order.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const page = orders.slice(0, limit);
  const reviewItems = await remainingOrderReviewProducts(page);
  const invoices = await Invoice.find({ orderId: { $in: page.map((order) => order.orderId) } }).select("orderId invoiceNumber").lean();
  const invoiceNumbers = new Map(invoices.map((invoice) => [invoice.orderId, invoice.invoiceNumber]));
  await Promise.all(page.filter((order) => order.paymentStatus === "paid" && !invoiceNumbers.has(order.orderId)).map(async (order) => {
    try {
      const invoice = await createOrderInvoice(order);
      if (invoice) invoiceNumbers.set(order.orderId, invoice.invoiceNumber);
    } catch (error) {
      logger.warn("order.history_invoice_unavailable", { orderId: order.orderId, detail: error.message });
    }
  }));
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: {
    orders: page.map((order) => ({
      ...publicOrder(order),
      reviewItems: reviewItems.get(order.orderId) || [],
      placedAt: order.createdAt,
      invoiceNumber: invoiceNumbers.get(order.orderId) || "",
      canPay: order.paymentMethod !== "cod" && RETRYABLE_PAYMENT_STATES.includes(order.paymentStatus) && order.orderStatus === "awaiting_payment",
    })),
    nextCursor: orders.length > limit ? String(page.at(-1)._id) : "",
  } });
});

exports.retryCustomerOrderPayment = asyncHandler(async (req, res) => {
  const filter = await ownedOrderFilter(req.body);
  const orderId = String(req.params.orderId || "").trim().toUpperCase();
  let original = await Order.findOne({ ...filter, orderId });
  if (!original) throw new AppError("Order not found", 404);
  res.set("Cache-Control", "no-store");
  if (original.paymentMethod === "cod" || !RETRYABLE_PAYMENT_STATES.includes(original.paymentStatus) || original.orderStatus !== "awaiting_payment") {
    return paymentState(res, original);
  }
  if (original.source === "whatsapp" && !original.razorpayOrderId) {
    const { order, paymentUrl, processing, expired } = await require("../services/whatsappCheckoutService").resumeHostedPayment(original);
    if (paymentUrl) {
      await resolveOrderItems(order.items);
      return res.json({ success: true, data: { paymentUrl } });
    }
    if (!expired) return paymentState(res, order, processing);
    await resolveOrderItems(order.items);
    const providerOrder = await createRazorpayOrder({
      amount: Math.round(order.total * 100), receipt: order.orderId, notes: { internalOrderId: order.orderId },
    });
    original = await Order.findOneAndUpdate({
      _id: order._id, razorpayOrderId: { $in: ["", null] }, razorpayPaymentLinkId: order.razorpayPaymentLinkId,
      paymentStatus: { $in: RETRYABLE_PAYMENT_STATES }, orderStatus: "awaiting_payment",
    }, { $set: { razorpayOrderId: providerOrder.id } }, { new: true }) || await Order.findById(order._id);
  }
  const { order, processing } = await reconcileOrderPayment(original);
  if (processing || !RETRYABLE_PAYMENT_STATES.includes(order.paymentStatus) || order.orderStatus !== "awaiting_payment") {
    return paymentState(res, order, processing);
  }
  if (!order.razorpayOrderId) throw new AppError("This payment session is unavailable. Please contact the shop.", 409);
  await resolveOrderItems(order.items);
  return res.json({ success: true, data: {
    orderId: order.orderId,
    razorpayOrderId: order.razorpayOrderId,
    keyId: env.razorpay.keyId,
    amount: Math.round(order.total * 100),
    currency: order.currency,
    customer: { name: order.customer.name, phone: order.customer.phone },
  } });
});

exports.createPaymentOrder = asyncHandler(async (req, res) => {
  const customer = sanitizeCustomer(req.body.customer);
  const { items, subtotal, discountedSubtotal, coupon, discountTotal, additionalCharges, deliveryCharge, total } = await buildOrderQuote(req.body.items, req.body.couponCode);
  if (total < 1) throw new AppError("Online payment requires an order total of at least Rs. 1. Please contact the shop for this order.", 400);
  const orderId = newPublicOrderId();
  const razorpayOrder = await createRazorpayOrder({
    amount: Math.round(total * 100),
    receipt: orderId.slice(0, 40),
    notes: {
      internalOrderId: orderId,
      customerName: customer.name,
      phone: customer.phone,
      whatsapp: customer.whatsappNumber,
    },
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
    whatsappOrderGreetingOptIn: req.body.whatsappOrderGreetingOptIn === true,
  });

  res.status(201).json({
    success: true,
    data: {
      orderId: order.orderId,
      razorpayOrderId: razorpayOrder.id,
      keyId: env.razorpay.keyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      customer: {
        name: customer.name,
        phone: customer.phone,
        whatsappNumber: customer.whatsappNumber,
      },
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

exports.markPaymentFailed = asyncHandler(async (req, res) => {
  const { order, processing, failed } = await reconcileOrderPayment(await findCheckoutPayment(req.body));
  if (processing || !failed) return paymentState(res, order, processing);
  const claimed = await Order.findOneAndUpdate({
    _id: order._id, paymentStatus: { $in: RETRYABLE_PAYMENT_STATES },
    orderStatus: "awaiting_payment", whatsappPaymentFailedNotifiedAt: null,
  }, { $set: { paymentStatus: "failed", whatsappPaymentFailedNotifiedAt: new Date() } }, { new: true });
  if (claimed) {
    try {
      await sendPaymentUnsuccessfulWhatsApp({ order: claimed });
    } catch (error) {
      logger.error("whatsapp.payment_failed_notify_error", {
        orderId: claimed.orderId,
        message: error.message,
      });
      await Order.updateOne({ _id: claimed._id, paymentStatus: "failed" },
        { $set: { whatsappPaymentFailedNotifiedAt: null } }).catch(() => undefined);
    }
  }
  return paymentState(res, claimed || await Order.findById(order._id));
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
  const order = await findCheckoutPayment(req.body);
  const { razorpayOrderId } = order;
  const razorpayPaymentId = String(req.body.razorpayPaymentId || "").trim();
  const signature = String(req.body.razorpaySignature || "").trim();
  if (!verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
    throw new AppError("Payment signature could not be verified", 400);
  }
  if (["paid", "refunded"].includes(order.paymentStatus)) {
    return res.set("Cache-Control", "no-store").json({ success: true, data: await publicOrderWithReviews(order) });
  }
  const payment = await getRazorpayPayment(razorpayPaymentId);
  if (!paymentMatches(order, payment) || payment.id !== razorpayPaymentId) throw new AppError("Payment details do not match this order", 400);
  if (payment.status !== "captured") throw new AppError("Your payment is still being verified.", 409);
  const confirmed = await confirmCapturedOrder(order, payment);
  if (!["paid", "refunded"].includes(confirmed?.paymentStatus)) throw new AppError("Your payment is still being verified.", 409);
  res.set("Cache-Control", "no-store").json({ success: true, data: await publicOrderWithReviews(confirmed) });
});

exports.handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.get("x-razorpay-signature");
  if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, signature)) {
    throw new AppError("Invalid Razorpay webhook signature", 400);
  }
  const event = JSON.parse(req.body.toString("utf8"));
  await require("../services/whatsappCheckoutService").handlePaymentLinkWebhook(event);
  if (["payment.captured", "payment.failed"].includes(event.event)) {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id && payment?.id) {
      const order = await Order.findOne({ razorpayOrderId: payment.order_id });
      if (order && paymentMatches(order, payment) && RETRYABLE_PAYMENT_STATES.includes(order.paymentStatus)) {
        if (event.event === "payment.captured" && payment.status === "captured") {
          await confirmCapturedOrder(order, payment);
        } else if (event.event === "payment.failed" && payment.status === "failed") {
          await Order.updateOne(
            { _id: order._id, paymentStatus: "pending", orderStatus: "awaiting_payment" },
            { $set: { paymentStatus: "failed" } },
          );
        }
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
  const order = await Order.findOne({ orderId, paymentStatus: { $in: ["paid", "refunded", "cod"] } }).lean();
  if (!order) throw new AppError("No confirmed order was found with this Order ID", 404);
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: await publicOrderWithReviews(order) });
});

exports.downloadPublicOrderInvoice = asyncHandler(async (req, res) => {
  const orderId = String(req.params.orderId || "").trim().toUpperCase();
  const order = await Order.findOne({ orderId, paymentStatus: { $in: ["paid", "refunded"] } });
  if (!order) throw new AppError("No paid order was found with this Order ID", 404);
  const invoice = await Invoice.findOne({ orderId }) || await createOrderInvoice(order);
  if (!invoice) throw new AppError("Invoice is not available for this order", 404);

  const pdf = await getOrderInvoicePdf(invoice, String(req.query.theme || "blue"));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

exports.listOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(10, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { paymentStatus: { $in: ["paid", "refunded", "cod"] } };
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
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(`${req.query.from}T00:00:00.000Z`);
    if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit), hasMore: page * limit < total } });
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const orderStatus = String(req.body.orderStatus || "").trim();
  if (!ORDER_STATUSES.includes(orderStatus)) throw new AppError("Invalid order status", 400);
  const previous = await Order.findById(req.params.id).select("orderStatus paymentStatus items").lean();
  if (!previous) throw new AppError("Order not found", 404);

  if (!["paid", "refunded", "cod"].includes(previous.paymentStatus)) throw new AppError("Unpaid orders cannot be confirmed or shipped", 409);
  const update = { orderStatus, statusUpdatedAt: new Date() };
  const reviewProducts = orderStatus === "delivered" && REVIEW_PAYMENT_STATES.includes(previous.paymentStatus)
    ? orderReviewProducts(previous) : [];
  const options = { new: true, runValidators: true };
  const queuedOrder = reviewProducts.length ? await Order.findOneAndUpdate({
    _id: req.params.id, paymentStatus: { $in: REVIEW_PAYMENT_STATES }, customerReviewQueue: { $exists: false },
  }, { $set: { ...update, customerReviewQueue: reviewProducts, customerReviewNextAttemptAt: update.statusUpdatedAt } }, options) : null;
  const order = queuedOrder || await Order.findByIdAndUpdate(
    req.params.id,
    update,
    options,
  );
  if (!order) throw new AppError("Order not found", 404);

  const statusChanged = previous.orderStatus !== orderStatus;
  if (statusChanged && ["shipped", "out_for_delivery"].includes(orderStatus)) {
    setImmediate(() => {
      sendOrderShipmentWhatsApp({ order }).catch((error) => {
        logger.error("whatsapp.order_shipment_failed", {
          orderId: order.orderId,
          message: error.message,
        });
      });
    });
  }
  res.json({ success: true, data: order });
});

exports.ORDER_STATUSES = ORDER_STATUSES;
exports.buildOrderQuote = buildOrderQuote;
exports.sanitizeCustomer = sanitizeCustomer;
exports.newPublicOrderId = newPublicOrderId;
