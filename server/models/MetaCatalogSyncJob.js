const mongoose = require("mongoose");

const metaCatalogSyncJobSchema = new mongoose.Schema(
  {
    jobKey: { type: String, required: true, unique: true, index: true },
    sourceType: { type: String, enum: ["shop-product", "project-part"], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    retailerId: { type: String, required: true, trim: true, uppercase: true, index: true },
    metaItemId: { type: String, default: "" },
    operation: { type: String, enum: ["UPSERT", "DELETE"], required: true },
    status: { type: String, enum: ["pending", "processing", "synced", "failed"], default: "pending", index: true },
    attempts: { type: Number, default: 0, min: 0 },
    revision: { type: Number, default: 0, min: 0 },
    nextRetryAt: { type: Date, default: Date.now, index: true },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

metaCatalogSyncJobSchema.index({ status: 1, nextRetryAt: 1, createdAt: 1 });

module.exports = mongoose.model("MetaCatalogSyncJob", metaCatalogSyncJobSchema);
