const mongoose = require("mongoose");

const demandImageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 100, default: "Customer upload" },
    mimeType: { type: String, trim: true, maxlength: 50, default: "image/jpeg" },
    url: { type: String, trim: true, maxlength: 2048, required: true },
  },
  { _id: false },
);

const demandCustomerEventSchema = new mongoose.Schema(
  {
    customerKey: { type: String, required: true, maxlength: 64 },
    query: { type: String, trim: true, maxlength: 1000, default: "Image-only request" },
    aiResponse: { type: String, trim: true, maxlength: 1500, default: "" },
    images: { type: [demandImageSchema], default: [] },
    firstDetectedAt: { type: Date, required: true },
    latestDetectedAt: { type: Date, required: true },
  },
  { _id: false },
);

const pulseAIUnavailableDemandSchema = new mongoose.Schema(
  {
    demandKey: { type: String, required: true, unique: true, index: true, maxlength: 220 },
    requestedItem: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: ["product", "service"], default: "product" },
    reason: { type: String, trim: true, maxlength: 500, default: "No exact active catalog match was available." },
    events: { type: [demandCustomerEventSchema], default: [] },
    firstDetectedAt: { type: Date, required: true, index: true },
    latestDetectedAt: { type: Date, required: true, index: true },
    lastAlertAt: { type: Date, default: null, index: true },
    lastAlertUniqueCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

pulseAIUnavailableDemandSchema.index({ latestDetectedAt: -1, lastAlertAt: -1 });

module.exports = mongoose.model("PulseAIUnavailableDemand", pulseAIUnavailableDemandSchema);
