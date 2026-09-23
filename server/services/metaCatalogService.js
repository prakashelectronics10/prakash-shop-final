const env = require("../config/env");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const MetaCatalogSyncJob = require("../models/MetaCatalogSyncJob");
const { logger } = require("../utils/logger");
const { mapProductToMeta } = require("./metaCatalogMapper");
const metaClient = require("./metaCatalogClient");

const MODEL_BY_SOURCE = {
  "shop-product": ShopProduct,
  "project-part": ProjectPart,
};

function modelFor(sourceType) {
  const Model = MODEL_BY_SOURCE[sourceType];
  if (!Model) throw new Error(`Unsupported Meta catalog source type: ${sourceType}`);
  return Model;
}

function otherModelFor(sourceType) {
  return sourceType === "shop-product" ? ProjectPart : ShopProduct;
}

function generatedSku(sourceType, productId) {
  const suffix = String(productId).slice(sourceType === "project-part" ? -8 : -10).toUpperCase();
  return sourceType === "project-part" ? `PE-WA-${suffix}` : `PE-${suffix}`;
}

function sanitizeSyncError(error) {
  return metaClient.sanitizedMetaMessage(error, "Meta Catalog synchronization failed.");
}

async function ensureStableSku(sourceType, product) {
  if (product.sku) return String(product.sku).trim().toUpperCase();
  const sku = generatedSku(sourceType, product._id);
  const Model = modelFor(sourceType);
  await Model.updateOne({ _id: product._id, $or: [{ sku: { $exists: false } }, { sku: "" }, { sku: null }] }, { $set: { sku } });
  product.sku = sku;
  return sku;
}

async function setProductMeta(sourceType, productId, patch) {
  if (!productId) return;
  const Model = modelFor(sourceType);
  const update = Object.fromEntries(Object.entries(patch).map(([key, value]) => [`metaCatalog.${key}`, value]));
  await Model.updateOne({ _id: productId }, { $set: update });
}

async function enqueueProductSync(sourceType, productOrId) {
  const Model = modelFor(sourceType);
  const product = typeof productOrId === "object" && productOrId?._id
    ? productOrId
    : await Model.findById(productOrId);
  if (!product) throw new Error("Product not found while scheduling Meta Catalog sync.");
  const retailerId = await ensureStableSku(sourceType, product);
  const conflictingProduct = await otherModelFor(sourceType).exists({ sku: retailerId });
  if (conflictingProduct) {
    const message = `SKU ${retailerId} is already used by another catalog product.`;
    await setProductMeta(sourceType, product._id, { status: "failed", error: message });
    const error = new Error(message);
    error.retryable = false;
    throw error;
  }
  const jobKey = `UPSERT:${sourceType}:${product._id}`;
  const now = new Date();
  const job = await MetaCatalogSyncJob.findOneAndUpdate(
    { jobKey },
    {
      $set: {
        sourceType,
        productId: product._id,
        retailerId,
        metaItemId: product.metaCatalog?.itemId || "",
        operation: "UPSERT",
        status: "pending",
        attempts: 0,
        nextRetryAt: now,
        lastError: "",
        completedAt: null,
      },
      $inc: { revision: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await setProductMeta(sourceType, product._id, { status: "pending", error: "" });
  return job;
}

async function enqueueProductDelete(sourceType, product) {
  const retailerId = await ensureStableSku(sourceType, product);
  const now = new Date();
  await MetaCatalogSyncJob.deleteMany({
    jobKey: `UPSERT:${sourceType}:${product._id}`,
    status: { $in: ["pending", "failed", "synced"] },
  });
  return MetaCatalogSyncJob.findOneAndUpdate(
    { jobKey: `DELETE:${sourceType}:${retailerId}` },
    {
      $set: {
        sourceType,
        productId: product._id,
        retailerId,
        metaItemId: product.metaCatalog?.itemId || "",
        operation: "DELETE",
        status: "pending",
        attempts: 0,
        nextRetryAt: now,
        lastError: "",
        completedAt: null,
      },
      $inc: { revision: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function calculateBackoffMs(attempt, baseMs = 30000) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  return Math.min(60 * 60 * 1000, baseMs * (2 ** (safeAttempt - 1)));
}

async function claimNextJob() {
  const now = new Date();
  const staleProcessingCutoff = new Date(now.getTime() - Math.max(60000, env.metaCatalog.requestTimeoutMs * 3));
  return MetaCatalogSyncJob.findOneAndUpdate(
    {
      $or: [
        { status: "pending", nextRetryAt: { $lte: now } },
        { status: "processing", lastAttemptAt: { $lte: staleProcessingCutoff } },
      ],
    },
    { $set: { status: "processing", lastAttemptAt: now }, $inc: { attempts: 1 } },
    { new: true, sort: { nextRetryAt: 1, createdAt: 1 } },
  );
}

async function completeJob(job, result = {}) {
  const completedAt = new Date();
  const updateResult = await MetaCatalogSyncJob.updateOne(
    { _id: job._id, revision: job.revision, status: "processing" },
    { $set: { status: "synced", completedAt, lastError: "" } },
  );
  if (!updateResult.matchedCount || job.operation !== "UPSERT") return;
  await setProductMeta(job.sourceType, job.productId, {
    status: "synced",
    itemId: String(result.id || job.metaItemId || ""),
    lastSyncedAt: completedAt,
    lastAttemptAt: completedAt,
    error: "",
  });
}

async function failJob(job, error) {
  const retryable = error?.retryable === true && job.attempts < env.metaCatalog.maxAttempts;
  const message = sanitizeSyncError(error);
  const now = new Date();
  const updateResult = await MetaCatalogSyncJob.updateOne(
    { _id: job._id, revision: job.revision, status: "processing" },
    {
      $set: retryable
        ? { status: "pending", nextRetryAt: new Date(now.getTime() + calculateBackoffMs(job.attempts)), lastError: message }
        : { status: "failed", completedAt: now, lastError: message },
    },
  );
  if (!updateResult.matchedCount || job.operation !== "UPSERT") return;
  await setProductMeta(job.sourceType, job.productId, {
    status: retryable ? "pending" : "failed",
    lastAttemptAt: now,
    error: message,
  });
}

async function processJob(job, { client = metaClient } = {}) {
  logger.info("meta_catalog.sync_started", {
    retailerId: job.retailerId,
    operation: job.operation,
    attempt: job.attempts,
  });
  try {
    if (job.operation === "UPSERT") {
      await setProductMeta(job.sourceType, job.productId, {
        status: "syncing",
        lastAttemptAt: new Date(),
        error: "",
      });
    }
    if (job.operation === "DELETE") {
      const result = await client.deleteProduct({ itemId: job.metaItemId, retailerId: job.retailerId });
      await completeJob(job, result);
    } else {
      const Model = modelFor(job.sourceType);
      const product = await Model.findById(job.productId).lean();
      if (!product) {
        await completeJob(job, { skipped: true });
        return { skipped: true };
      }
      const payload = mapProductToMeta(product, { sourceType: job.sourceType, origin: env.productionUrl });
      const result = await client.upsertProduct(payload);
      await completeJob(job, result);
    }
    logger.info("meta_catalog.sync_completed", { retailerId: job.retailerId, operation: job.operation });
    return { success: true };
  } catch (error) {
    await failJob(job, error);
    logger.warn("meta_catalog.sync_failed", {
      retailerId: job.retailerId,
      operation: job.operation,
      code: error?.code || null,
      retryable: error?.retryable === true,
      error: sanitizeSyncError(error),
    });
    return { success: false, error };
  }
}

async function processDueJobs({ concurrency = env.metaCatalog.concurrency, client = metaClient } = {}) {
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    const job = await claimNextJob();
    return job ? processJob(job, { client }) : null;
  });
  return Promise.all(workers);
}

async function syncAllProducts() {
  const [shopProducts, projectParts] = await Promise.all([
    ShopProduct.find({}).select("_id sku metaCatalog"),
    ProjectPart.find({}).select("_id sku metaCatalog"),
  ]);
  let queued = 0;
  const items = [
    ...shopProducts.map((product) => ["shop-product", product]),
    ...projectParts.map((product) => ["project-part", product]),
  ];
  for (const [sourceType, product] of items) {
    await enqueueProductSync(sourceType, product);
    queued += 1;
  }
  return { total: items.length, queued, skipped: items.length - queued };
}

async function retryFailedJobs() {
  const jobs = await MetaCatalogSyncJob.find({ status: "failed" }).select("_id sourceType productId operation").lean();
  if (!jobs.length) return { queued: 0 };
  const now = new Date();
  await MetaCatalogSyncJob.updateMany(
    { _id: { $in: jobs.map((job) => job._id) } },
    {
      $set: { status: "pending", attempts: 0, nextRetryAt: now, lastError: "", completedAt: null },
      $inc: { revision: 1 },
    },
  );
  await Promise.all(jobs
    .filter((job) => job.operation === "UPSERT" && job.productId)
    .map((job) => setProductMeta(job.sourceType, job.productId, { status: "pending", error: "" })));
  return { queued: jobs.length };
}

async function getMetaSyncStatus() {
  const [pending, processing, synced, failed] = await Promise.all(
    ["pending", "processing", "synced", "failed"].map((status) => MetaCatalogSyncJob.countDocuments({ status })),
  );
  return {
    configured: Boolean(env.metaCatalog.catalogId && env.metaCatalog.accessToken),
    graphApiVersion: env.metaCatalog.graphApiVersion,
    catalogIdConfigured: Boolean(env.metaCatalog.catalogId),
    jobs: { pending, processing, synced, failed },
  };
}

async function testMetaConnection(options) {
  const catalog = await metaClient.testConnection(options);
  return { id: catalog.id, name: catalog.name || "Meta product catalog" };
}

async function ensureMetaCatalogIndexes() {
  await MetaCatalogSyncJob.createIndexes();
}

module.exports = {
  calculateBackoffMs,
  enqueueProductDelete,
  enqueueProductSync,
  ensureStableSku,
  ensureMetaCatalogIndexes,
  generatedSku,
  getMetaSyncStatus,
  processDueJobs,
  processJob,
  retryFailedJobs,
  sanitizeSyncError,
  syncAllProducts,
  testMetaConnection,
};
