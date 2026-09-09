const mongoose = require("mongoose");

const pulseAIUnavailableDemandSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "default",
      unique: true,
      immutable: true,
    },
    minimumUniqueCustomers: {
      type: Number,
      min: 2,
      max: 100,
      default: 7,
    },
    trackingPeriodHours: {
      type: Number,
      enum: [24, 168, 720],
      default: 168,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("PulseAIUnavailableDemandSettings", pulseAIUnavailableDemandSettingsSchema);
