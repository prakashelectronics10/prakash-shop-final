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
    clientType: {
      type: String,
      enum: ["web", "mobile"],
      default: "web",
      index: true,
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
  { admin: 1, clientType: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: "admin_1_clientType_1_isActive_1",
  },
);

module.exports = mongoose.model("AdminSession", adminSessionSchema);
