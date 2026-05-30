const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["owner", "mainAdmin", "admin", "manager", "employee", "editor"],
      default: "admin",
    },
    tag: {
      type: String,
      trim: true,
      default: "admin",
    },
    permissions: {
      type: [String],
      default: [],
    },
    adminAndroidAppAccess: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastMobileLogin: Date,
    mobileAccessRequestedAt: Date,
    avatarUrl: {
      type: String,
      trim: true,
      default: "",
    },
    avatarPublicId: {
      type: String,
      trim: true,
      default: "",
    },
    expoPushTokens: [
      {
        token: { type: String, required: true, trim: true },
        deviceId: { type: String, trim: true, default: "" },
        platform: { type: String, trim: true, default: "android" },
        active: { type: Boolean, default: true, index: true },
        lastSeenAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    pushTokens: [
      {
        token: { type: String, required: true, trim: true },
        deviceId: { type: String, trim: true, default: "" },
        platform: { type: String, trim: true, default: "android" },
        active: { type: Boolean, default: true, index: true },
        lastSeenAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

adminSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

adminSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model("Admin", adminSchema);
