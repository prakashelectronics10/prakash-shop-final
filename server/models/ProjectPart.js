const mongoose = require("mongoose");
const slugify = require("../utils/slugify");

const projectPartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },
    category: { type: String, default: "Wiring Products", trim: true, index: true },
    subCategory: { type: String, default: "", trim: true, index: true },
    mrp: { type: Number, default: null, min: 0 },
    discountPercent: { type: Number, default: null, min: 0, max: 100 },
    price: { type: Number, default: null },
    stock: { type: Number, default: 1, min: 1, max: 9999 },
    availability: { type: String, default: "In Stock", enum: ["In Stock", "Low Stock", "Out of Stock", "Not Available"] },
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
    sku: { type: String, trim: true, uppercase: true, sparse: true, unique: true, index: true },
    brand: { type: String, trim: true, default: "" },
    gtin: { type: String, trim: true, default: "" },
    mpn: { type: String, trim: true, default: "" },
    manufacturer: { type: String, trim: true, default: "" },
    modelNumber: { type: String, trim: true, default: "" },
    condition: { type: String, enum: ["new", "refurbished", "used"], default: "new" },
    productType: { type: String, trim: true, default: "" },
    googleProductCategory: { type: String, trim: true, default: "" },
    warranty: { type: String, trim: true, default: "" },
    weight: {
      value: { type: Number, min: 0, default: null },
      unit: { type: String, enum: ["g", "kg"], default: "kg" },
    },
    dimensions: {
      length: { type: Number, min: 0, default: null },
      width: { type: Number, min: 0, default: null },
      height: { type: Number, min: 0, default: null },
      unit: { type: String, enum: ["cm", "in"], default: "cm" },
    },
    shipping: {
      serviceArea: { type: String, trim: true, default: "" },
      dispatchTime: { type: String, trim: true, default: "" },
      deliveryEstimate: { type: String, trim: true, default: "" },
      chargeNote: { type: String, trim: true, default: "" },
    },
    seoTitle: { type: String, trim: true, default: "" },
    seoDescription: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    isTopProduct: { type: Boolean, default: false, index: true },
    displayOrder: { type: Number, default: 0, index: true },
    viewCount: { type: Number, default: 0, min: 0, index: true },
  },
  { timestamps: true },
);

projectPartSchema.pre("validate", function setSlug(next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (!this.sku && this._id) this.sku = `PE-WA-${String(this._id).slice(-8).toUpperCase()}`;
  next();
});

projectPartSchema.index({ isActive: 1, displayOrder: 1, name: 1 });
projectPartSchema.index({ isActive: 1, category: 1, displayOrder: 1 });
projectPartSchema.index({ isActive: 1, category: 1, subCategory: 1, displayOrder: 1 });
projectPartSchema.index({ isActive: 1, viewCount: -1, displayOrder: 1 });
projectPartSchema.index({ isActive: 1, isTopProduct: 1, displayOrder: 1 });
projectPartSchema.index({
  name: "text",
  shortDescription: "text",
  description: "text",
  category: "text",
  subCategory: "text",
  tags: "text",
});

module.exports = mongoose.model("ProjectPart", projectPartSchema);
