const mongoose = require("mongoose");

const reviewDeliverySchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  attempts: { type: Number, default: 0 },
  claim: mongoose.Schema.Types.ObjectId,
  nextAttemptAt: Date,
  messageId: String,
  phoneNumberId: String,
});

const productReviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceType: { type: String, enum: ["shop-product", "project-part"], required: true },
  productName: { type: String, trim: true, required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  orderId: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, validate: Number.isInteger, required: true },
  review: { type: String, trim: true, maxlength: 1200, default: "" },
  status: { type: String, enum: ["pending", "approved", "declined"], default: "pending" },
  readAt: { type: Date, default: null },
  moderatedAt: Date,
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  moderatedByWhatsAppRecipient: mongoose.Schema.Types.ObjectId,
  whatsappGeneration: mongoose.Schema.Types.ObjectId,
  whatsappDeliveries: { type: [reviewDeliverySchema], default: undefined },
}, { timestamps: true });

productReviewSchema.index({ order: 1, sourceType: 1, productId: 1 }, { unique: true });
productReviewSchema.index({ productId: 1, sourceType: 1, status: 1, createdAt: -1, _id: -1 });
productReviewSchema.index({ createdAt: -1, _id: -1 });
productReviewSchema.index({ "whatsappDeliveries.nextAttemptAt": 1 }, { sparse: true });
productReviewSchema.index({ "whatsappDeliveries.messageId": 1 }, { sparse: true });

const ProductReview = mongoose.model("ProductReview", productReviewSchema);

let indexPreparation;
ProductReview.ensureReviewIndexes = () => {
  indexPreparation ??= ProductReview.createIndexes().catch((error) => {
    indexPreparation = undefined;
    throw error;
  });
  return indexPreparation;
};

module.exports = ProductReview;
