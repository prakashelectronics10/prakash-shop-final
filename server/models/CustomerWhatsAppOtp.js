const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const customerWhatsAppOtpSchema = new mongoose.Schema(
  {
    whatsappNumber: { type: String, required: true, trim: true, index: true },
    purpose: {
      type: String,
      enum: ["booking", "checkout"],
      required: true,
      index: true,
    },
    otpHash: { type: String, required: true, select: false },
    verifiedTokenHash: { type: String, default: "", select: false },
    customerName: { type: String, default: "", trim: true },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    resendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

customerWhatsAppOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
customerWhatsAppOtpSchema.index({ whatsappNumber: 1, purpose: 1, createdAt: -1 });

customerWhatsAppOtpSchema.statics.hashOtp = function hashOtp(otp) {
  return bcrypt.hash(String(otp), 10);
};

customerWhatsAppOtpSchema.statics.hashToken = function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
};

customerWhatsAppOtpSchema.methods.compareOtp = function compareOtp(otp) {
  return bcrypt.compare(String(otp), this.otpHash);
};

module.exports = mongoose.model("CustomerWhatsAppOtp", customerWhatsAppOtpSchema);
