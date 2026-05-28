const mongoose = require("mongoose");

const adminSessionSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    jwtIdHash: {
      type: String,
      required: true,
    },
    userAgentHash: {
      type: String,
      default: "",
    },
    ipHash: {
      type: String,
      default: "",
    },
    deviceLabel: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: Date,
    revokeReason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

adminSessionSchema.index(
  { admin: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  },
);

module.exports = mongoose.model("AdminSession", adminSessionSchema);
