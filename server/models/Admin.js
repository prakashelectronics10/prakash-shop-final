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
      enum: ["owner", "admin", "manager", "editor"],
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
