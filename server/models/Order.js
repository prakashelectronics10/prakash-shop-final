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
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ "customer.name": "text", "customer.phone": "text", orderId: "text" });

module.exports = mongoose.model("Order", orderSchema);
