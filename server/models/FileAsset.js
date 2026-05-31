const mongoose = require("mongoose");

const fileAssetSchema = new mongoose.Schema(
  {
    originalName: { type: String, trim: true, default: "" },
    fileName: { type: String, trim: true, required: true },
    mimeType: { type: String, trim: true, required: true, index: true },
    fileSize: { type: Number, min: 0, default: 0 },
    fileType: {
      type: String,
      enum: ["image", "pdf", "document", "spreadsheet", "presentation", "archive", "text", "file"],
      default: "file",
      index: true,
    },
    extension: { type: String, trim: true, default: "" },
    storageProvider: { type: String, enum: ["cloudinary", "local", "gridfs", "external"], default: "cloudinary" },
    fileUrl: { type: String, trim: true, default: "" },
    downloadUrl: { type: String, trim: true, default: "" },
    secureUrl: { type: String, trim: true, required: true },
    publicId: { type: String, trim: true, default: "", index: true },
    path: { type: String, trim: true, default: "" },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null, index: true },
    relatedType: { type: String, enum: ["invoice", "discussion", "booking", "product", "other"], default: "other", index: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    relatedInvoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null, index: true },
    relatedDiscussionMessage: { type: mongoose.Schema.Types.ObjectId, ref: "DiscussionMessage", default: null, index: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { timestamps: true },
);

fileAssetSchema.index({ relatedType: 1, relatedId: 1, createdAt: -1 });

module.exports = mongoose.model("FileAsset", fileAssetSchema);
