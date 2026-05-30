const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "booking",
        "admin_request",
        "discussion_message",
        "system",
        "warning",
        "success",
        "review",
        "android_access_request",
        "android_access_granted",
      ],
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
    body: {
      type: String,
      trim: true,
      default: "",
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
    receiverAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
      },
    ],
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
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    discussionMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionMessage",
      default: null,
      index: true,
    },
    requestedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
    adminRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    icon: {
      type: String,
      trim: true,
      default: "",
    },
    screen: {
      type: String,
      trim: true,
      default: "notifications",
    },
    deepLinkData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
notificationSchema.index({ receiverAdmins: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
