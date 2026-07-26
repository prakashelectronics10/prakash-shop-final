const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminOtpChallengeSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ["login", "admin-create", "mobile-login", "mobile-grant"],
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
      select: false,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    secondaryEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    secondaryOtpHash: {
      type: String,
      select: false,
      default: "",
    },
    secondaryAttempts: {
      type: Number,
      default: 0,
    },
    requesterSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminSession",
      default: null,
    },
    ipHash: {
      type: String,
      default: "",
    },
    userAgentHash: {
      type: String,
      default: "",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: Date,
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    resendCount: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

adminOtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

adminOtpChallengeSchema.statics.hashOtp = function hashOtp(otp) {
  return bcrypt.hash(String(otp), 12);
};

adminOtpChallengeSchema.methods.compareOtp = function compareOtp(otp) {
  return bcrypt.compare(String(otp), this.otpHash);
};

adminOtpChallengeSchema.methods.compareSecondaryOtp = function compareSecondaryOtp(otp) {
  if (!this.secondaryOtpHash) return Promise.resolve(false);
  return bcrypt.compare(String(otp), this.secondaryOtpHash);
};

module.exports = mongoose.model("AdminOtpChallenge", adminOtpChallengeSchema);
