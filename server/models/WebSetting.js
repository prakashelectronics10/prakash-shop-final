const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: "" },
    publicId: { type: String, trim: true, default: "" },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    format: { type: String, trim: true, default: "" },
    bytes: { type: Number, default: 0 },
    updatedAt: Date,
  },
  { _id: false },
);

const webSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
      index: true,
    },
    ogImage: { type: assetSchema, default: () => ({}) },
    favicon: { type: assetSchema, default: () => ({}) },
    appleTouchIcon: { type: assetSchema, default: () => ({}) },
    faviconSizes: {
      type: [assetSchema],
      default: [],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WebSetting", webSettingSchema);
