const mongoose = require("mongoose");

const ctaSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    href: { type: String, default: "" },
  },
  { _id: false },
);

const heroSectionSchema = new mongoose.Schema(
  {
    eyebrow: { type: String, default: "" },
    title: { type: String, default: "" },
    highlight: { type: String, default: "" },
    titleSuffix: { type: String, default: "" },
    description: { type: String, default: "" },
    primaryCta: { type: ctaSchema, default: () => ({}) },
    secondaryCta: { type: ctaSchema, default: () => ({}) },
    image: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
      alt: { type: String, default: "" },
    },
    trustBadges: [
      {
        iconName: { type: String, default: "ShieldCheck" },
        label: { type: String, default: "" },
      },
    ],
    ratingText: { type: String, default: "" },
    floatingBadges: [
      {
        label: { type: String, default: "" },
        value: { type: String, default: "" },
      },
    ],
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("HeroSection", heroSectionSchema);
