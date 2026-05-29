const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["booking", "review", "android_access_request", "android_access_granted", "system"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    targetAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    relatedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    requestedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
    actionStatus: {
      type: String,
      enum: ["none", "pending", "granted", "dismissed"],
      default: "none",
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true },
);

notificationSchema.index({ targetAdmin: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ targetAdmin: 1, type: 1, actionStatus: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
