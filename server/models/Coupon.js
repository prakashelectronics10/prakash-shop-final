const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },
    description: { type: String, trim: true, default: "" },
    visibility: { type: String, enum: ["public", "private"], default: "public", index: true },
    discountType: { type: String, enum: ["percent", "fixed"], default: "percent" },
    discountValue: { type: Number, required: true, min: 0.01 },
    maxDiscountAmount: { type: Number, min: 0, default: null },
    minimumSubtotal: { type: Number, min: 0, default: 0 },
    appliesToAll: { type: Boolean, default: false },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ShopProduct" }],
    categories: [{ type: String, trim: true }],
    bannerImageUrl: { type: String, trim: true, default: "" },
    imageLayout: { type: String, enum: ["banner", "thumbnail"], default: "banner" },
    bannerImagePublicId: { type: String, trim: true, default: "" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

couponSchema.index({ isActive: 1, visibility: 1, startsAt: 1, endsAt: 1, displayOrder: 1 });
couponSchema.index({ productIds: 1, isActive: 1 });
couponSchema.index({ categories: 1, isActive: 1 });

couponSchema.pre("validate", function normalizeCoupon(next) {
  this.code = String(this.code || "").trim().toUpperCase().replace(/\s+/g, "");
  this.categories = [...new Set((this.categories || []).map((item) => String(item || "").trim()).filter(Boolean))];
  this.productIds = [...new Set((this.productIds || []).map((item) => String(item || "")).filter(Boolean))];
  if (this.discountType === "percent" && this.discountValue > 100) {
    this.invalidate("discountValue", "Percentage discount cannot exceed 100%");
  }
  if (this.visibility === "private") {
    this.bannerImageUrl = "";
    this.bannerImagePublicId = "";
  }
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    this.invalidate("endsAt", "End date must be after the start date");
  }
  if (!this.appliesToAll && !this.productIds.length && !this.categories.length) {
    this.invalidate("productIds", "Choose products, categories, or all products");
  }
  next();
});

module.exports = mongoose.model("Coupon", couponSchema);
