const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    customerEmail: { type: String, default: "", lowercase: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    repairType: { type: String, required: true, trim: true },
    message: { type: String, default: "", trim: true },
    productId: { type: String, default: "", trim: true },
    productSlug: { type: String, default: "", trim: true },
    productName: { type: String, default: "", trim: true },
    productCategory: { type: String, default: "", trim: true },
    productImageUrl: { type: String, default: "" },
    products: [{
      productId: { type: String, default: "", trim: true },
      productSlug: { type: String, default: "", trim: true },
      productName: { type: String, default: "", trim: true },
      productCategory: { type: String, default: "", trim: true },
      originalCategory: { type: String, default: "", trim: true },
      productImageUrl: { type: String, default: "" },
      productDescription: { type: String, default: "", trim: true },
      price: { type: Number, default: null },
      quantity: { type: Number, default: 1, min: 1, max: 99 },
      sourceType: { type: String, default: "", trim: true },
      sourceId: { type: String, default: "", trim: true },
    }],
    bookingSource: { type: String, default: "manual", trim: true },
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    images: [{
      url: { type: String, required: true },
      publicId: { type: String, default: "" },
      source: { type: String, default: "upload" },
      uploadedAt: { type: Date, default: Date.now }
    }],
    emailNotification: {
      status: {
        type: String,
        enum: ["not_configured", "queued", "retrying", "pending", "sent", "partial", "failed"],
        default: "pending",
        index: true,
      },
      sentAt: Date,
      attemptedAt: Date,
      attempts: { type: Number, default: 0 },
      recipients: [{ type: String, lowercase: true, trim: true }],
      failedRecipients: [{ type: String, lowercase: true, trim: true }],
      messageId: { type: String, default: "" },
      error: { type: String, default: "" },
      provider: { type: String, default: "" },
      logs: [
        {
          recipient: { type: String, default: "", lowercase: true, trim: true },
          status: { type: String, enum: ["queued", "sent", "failed", "retrying"], default: "queued" },
          provider: { type: String, default: "" },
          messageId: { type: String, default: "" },
          error: { type: String, default: "" },
          attempt: { type: Number, default: 0 },
          at: { type: Date, default: Date.now },
        },
      ],
    },
    customerConfirmation: {
      status: {
        type: String,
        enum: ["not_requested", "not_configured", "sent", "failed"],
        default: "not_requested",
      },
      sentAt: Date,
      attemptedAt: Date,
      messageId: { type: String, default: "" },
      error: { type: String, default: "" },
    },
    repairNotification: {
      status: {
        type: String,
        enum: ["not_requested", "not_configured", "sent", "failed"],
        default: "not_requested",
      },
      sentAt: Date,
      attemptedAt: Date,
      messageId: { type: String, default: "" },
      provider: { type: String, default: "" },
      error: { type: String, default: "" },
    },
    status: { type: String, enum: ["pending", "repaired"], default: "pending", index: true },
    requestedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

bookingSchema.index({ status: 1, requestedAt: -1 });
bookingSchema.index({ phoneNumber: 1, requestedAt: -1 });
bookingSchema.index({ productSlug: 1, requestedAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
