const mongoose = require("mongoose");
const slugify = require("../utils/slugify");

const projectPartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    category: { type: String, default: "Components", trim: true, index: true },
    price: { type: Number, default: null },
    stock: { type: Number, default: 1, min: 1, max: 9999 },
    availability: { type: String, default: "In Stock", enum: ["In Stock", "Low Stock", "Out of Stock", "Not Available"] },
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    tags: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    displayOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

projectPartSchema.pre("validate", function setSlug(next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  next();
});

projectPartSchema.index({ isActive: 1, displayOrder: 1, name: 1 });
projectPartSchema.index({ isActive: 1, category: 1, displayOrder: 1 });
projectPartSchema.index({ name: "text", shortDescription: "text", description: "text", category: "text", tags: "text" });

module.exports = mongoose.model("ProjectPart", projectPartSchema);
