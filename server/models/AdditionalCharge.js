const mongoose = require("mongoose");

const additionalChargeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    amount: { type: Number, default: null, min: 0, max: 1000000 },
    isActive: { type: Boolean, default: true, index: true },
    isSystem: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

additionalChargeSchema.index({ sortOrder: 1, createdAt: 1 });

module.exports = mongoose.model("AdditionalCharge", additionalChargeSchema);
