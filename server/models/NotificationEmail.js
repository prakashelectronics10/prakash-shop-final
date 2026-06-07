const mongoose = require("mongoose");

const notificationEmailSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    label: {
      type: String,
      trim: true,
      default: "",
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["manual", "adminAccount"],
      default: "manual",
    },
    lastDeliveryAt: Date,
  },
  { timestamps: true },
);

notificationEmailSchema.index({ isEnabled: 1, email: 1 });

module.exports = mongoose.model("NotificationEmail", notificationEmailSchema);
