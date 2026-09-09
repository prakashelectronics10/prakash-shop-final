const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: ["shop-product", "project-part"], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productSlug: { type: String, trim: true, default: "" },
    productName: { type: String, required: true, trim: true },
    productCategory: { type: String, trim: true, default: "" },
    productImageUrl: { type: String, trim: true, default: "" },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    lineTotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, min: 0, default: 0 },
    couponCode: { type: String, trim: true, default: "" },
    discountedUnitPrice: { type: Number, required: true, min: 0, default: 0 },
    discountedLineTotal: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const orderChargeSchema = new mongoose.Schema(
  {
    chargeId: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderCouponSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    code: { type: String, trim: true, uppercase: true, default: "" },
    title: { type: String, trim: true, default: "" },
    visibility: { type: String, enum: ["public", "private"], default: "public" },
    discountType: { type: String, enum: ["percent", "fixed"] },
    discountValue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true, index: true },
      address: { type: String, required: true, trim: true },
      pincode: { type: String, required: true, match: /^\d{6}$/ },
      landmark: { type: String, trim: true, default: "" },
      message: { type: String, trim: true, default: "" },
    },
    items: { type: [orderItemSchema], required: true, validate: [(items) => items.length > 0, "Order requires at least one item"] },
    itemCount: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
    coupon: { type: orderCouponSchema, default: null },
    discountTotal: { type: Number, required: true, min: 0, default: 0 },
    additionalCharges: { type: [orderChargeSchema], default: [] },
    deliveryCharge: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR", enum: ["INR"] },
    paymentStatus: { type: String, default: "pending", enum: ["pending", "paid", "failed", "refunded"], index: true },
    orderStatus: {
      type: String,
      default: "confirmed",
      enum: ["confirmed", "shipped", "out_for_delivery", "delivered", "cancelled"],
      index: true,
    },
    razorpayOrderId: { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, trim: true, default: "", index: true },
    paidAt: Date,
    statusUpdatedAt: { type: Date, default: Date.now },
    cancellationRequest: {
      status: { type: String, enum: ["none", "requested", "processing", "accepted", "rejected"], default: "none" },
      reason: { type: String, trim: true, default: "" },
      requestedAt: Date,
      resolvedAt: Date,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
      adminNote: { type: String, trim: true, default: "" },
    },
    refund: {
      status: { type: String, enum: ["not_required", "processing", "processed", "failed"], default: "not_required" },
      providerRefundId: { type: String, trim: true, default: "" },
      amount: { type: Number, min: 0, default: 0 },
      initiatedAt: Date,
      completedAt: Date,
      failureMessage: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ "customer.name": "text", "customer.phone": "text", orderId: "text" });

module.exports = mongoose.model("Order", orderSchema);
