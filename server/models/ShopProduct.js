const mongoose = require("mongoose");
const slugify = require("../utils/slugify");

const shopProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true, index: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },
    category: { type: String, default: "Electronics", trim: true, index: true },
    price: { type: Number, default: null },
    quantity: { type: Number, default: 1, min: 1, max: 9999 },
    availability: { type: String, default: "In Stock", enum: ["In Stock", "Out of Stock", "Low Stock"] },
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    images: [
      {
        url: { type: String, default: "" },
        publicId: { type: String, default: "" },
        alt: { type: String, default: "" },
      },
    ],
    tags: [{ type: String, trim: true }],
    specifications: [
      {
        label: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

shopProductSchema.index({
  name: "text",
  shortDescription: "text",
  description: "text",
  category: "text",
  tags: "text",
});
shopProductSchema.index({ isActive: 1, displayOrder: 1, name: 1 });
shopProductSchema.index({ isActive: 1, category: 1, displayOrder: 1 });
shopProductSchema.index({ isActive: 1, price: 1, displayOrder: 1 });

shopProductSchema.pre("validate", function setSlug(next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  next();
});

module.exports = mongoose.model("ShopProduct", shopProductSchema);
