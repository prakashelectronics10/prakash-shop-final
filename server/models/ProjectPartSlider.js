const mongoose = require("mongoose");

const projectPartSliderSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true },
    imagePublicId: { type: String, default: "" },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ProjectPartSlider", projectPartSliderSchema);