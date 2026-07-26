const mongoose = require("mongoose");
const slugify = require("../utils/slugify");

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true, index: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },
    price: { type: Number, default: null },
    originalPrice: { type: Number, default: null },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    categoryName: { type: String, default: "" },
    iconName: { type: String, default: "Plug" },
    iconImageUrl: { type: String, default: "" },
    iconImagePublicId: { type: String, default: "" },
    badge: { type: String, default: "" },
    highlights: [{ type: String, trim: true }],
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    gallery: [
      {
        url: String,
        publicId: String,
        alt: String,
      },
    ],
    detail: {
      eyebrow: { type: String, default: "" },
      overview: { type: String, default: "" },
      idealFor: [{ type: String, trim: true }],
      steps: [{ type: String, trim: true }],
      features: [{ type: String, trim: true }],
    },
    ctaLabel: { type: String, default: "Learn more" },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    displayOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

productSchema.pre("validate", function setSlug(next) {
  if (!this.slug && this.title) this.slug = slugify(this.title);
  next();
});

productSchema.index({ isActive: 1, displayOrder: 1, createdAt: -1 });
productSchema.index({ isActive: 1, categoryName: 1, displayOrder: 1 });
productSchema.index({ title: "text", shortDescription: "text", description: "text", categoryName: "text" });

module.exports = mongoose.model("Product", productSchema);
