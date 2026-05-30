const crypto = require("crypto");
const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "Item" },
    quantity: { type: Number, min: 0, default: 1 },
    unitPrice: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    totalPrice: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    invoiceDate: { type: Date, required: true, default: Date.now, index: true },
    dueDate: { type: Date, default: Date.now, index: true },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending", "partial"],
      default: "pending",
      index: true,
    },
    business: {
      name: { type: String, trim: true, default: "Prakash Electronics" },
      logoUrl: { type: String, trim: true, default: "" },
      logoPublicId: { type: String, trim: true, default: "" },
      address: { type: String, trim: true, default: "" },
      gstNumber: { type: String, trim: true, default: "" },
      contactNumber: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, lowercase: true, default: "" },
      websiteUrl: { type: String, trim: true, default: "" },
    },
    customer: {
      name: { type: String, trim: true, index: true, default: "Walk-in Customer" },
      phone: { type: String, trim: true, default: "" },
      email: { type: String, trim: true, lowercase: true, default: "" },
      address: { type: String, trim: true, default: "" },
      customerId: { type: String, trim: true, default: "" },
    },
    items: {
      type: [invoiceItemSchema],
      default: [],
    },
    totals: {
      subtotal: { type: Number, min: 0, default: 0 },
      discountTotal: { type: Number, min: 0, default: 0 },
      taxTotal: { type: Number, min: 0, default: 0 },
      grandTotal: { type: Number, min: 0, default: 0 },
    },
    template: {
      type: String,
      enum: ["minimal", "glass", "modern-blue", "dark", "corporate"],
      default: "modern-blue",
    },
    theme: {
      primaryColor: { type: String, trim: true, default: "#2563eb" },
      accentColor: { type: String, trim: true, default: "#38bdf8" },
      buttonColor: { type: String, trim: true, default: "#0f172a" },
      headerColor: { type: String, trim: true, default: "#020617" },
      textColor: { type: String, trim: true, default: "#0f172a" },
      backgroundColor: { type: String, trim: true, default: "#ffffff" },
    },
    notes: { type: String, trim: true, default: "" },
    signatureLabel: { type: String, trim: true, default: "Authorised Signature" },
    pdfUrl: { type: String, trim: true, default: "" },
    pdfFileAsset: { type: mongoose.Schema.Types.ObjectId, ref: "FileAsset", default: null },
    pdfFile: {
      fileName: { type: String, trim: true, default: "" },
      fileUrl: { type: String, trim: true, default: "" },
      downloadUrl: { type: String, trim: true, default: "" },
      mimeType: { type: String, trim: true, default: "application/pdf" },
      fileSize: { type: Number, min: 0, default: 0 },
      storageProvider: { type: String, trim: true, default: "" },
      publicId: { type: String, trim: true, default: "" },
      createdAt: { type: Date, default: null },
    },
    publicAccessToken: { type: String, trim: true, unique: true, sparse: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

invoiceSchema.pre("validate", function ensurePublicToken(next) {
  if (!this.publicAccessToken) {
    this.publicAccessToken = crypto.randomBytes(24).toString("hex");
  }
  next();
});

invoiceSchema.index({ "customer.name": "text", "customer.phone": "text", invoiceNumber: "text" });

module.exports = mongoose.model("Invoice", invoiceSchema);
