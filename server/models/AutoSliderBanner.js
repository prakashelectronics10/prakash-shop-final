const mongoose = require("mongoose");

const autoSliderBannerSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    alt: { type: String, default: "", trim: true },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

autoSliderBannerSchema.index({ isActive: 1, displayOrder: 1, createdAt: -1 });

module.exports = mongoose.model("AutoSliderBanner", autoSliderBannerSchema);
