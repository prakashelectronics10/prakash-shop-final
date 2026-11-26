const mongoose = require("mongoose");

const reviewWhatsAppOtpSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  challengeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  whatsappNumber: { type: String, required: true },
  otpHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

reviewWhatsAppOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ReviewWhatsAppOtp", reviewWhatsAppOtpSchema);
