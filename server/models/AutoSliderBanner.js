const mongoose = require("mongoose");

const PLACEMENTS = ["hero", "belowTrending"];

const autoSliderBannerSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    alt: { type: String, default: "", trim: true },
    link: { type: String, default: "", trim: true },
    placement: {
      type: String,
      enum: PLACEMENTS,
      default: "hero",
      index: true,
    },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

autoSliderBannerSchema.index({ placement: 1, isActive: 1, displayOrder: 1, createdAt: -1 });
autoSliderBannerSchema.index({ isActive: 1, displayOrder: 1, createdAt: -1 });

module.exports = mongoose.model("AutoSliderBanner", autoSliderBannerSchema);
module.exports.PLACEMENTS = PLACEMENTS;
