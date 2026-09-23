const AppError = require("../utils/AppError");
const catchAsync = require("../utils/asyncHandler");
const {
  enqueueProductSync,
  getMetaSyncStatus,
  sanitizeSyncError,
  syncAllProducts,
  testMetaConnection,
  retryFailedJobs,
} = require("../services/metaCatalogService");

const SOURCE_TYPES = new Set(["shop-product", "project-part"]);

function sourceType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SOURCE_TYPES.has(normalized)) throw new AppError("Unsupported product source type", 400);
  return normalized;
}

exports.getStatus = catchAsync(async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: await getMetaSyncStatus() });
});

exports.testConnection = catchAsync(async (_req, res) => {
  try {
    const catalog = await testMetaConnection();
    res.set("Cache-Control", "no-store");
    res.json({
      success: true,
      message: `Meta Catalog connection successful. Catalog: ${catalog.name}`,
      data: catalog,
    });
  } catch (error) {
    res.status(error.status === 401 || error.status === 403 ? 403 : 400).json({
      success: false,
      message: sanitizeSyncError(error),
    });
  }
});

exports.syncAll = catchAsync(async (_req, res) => {
  const result = await syncAllProducts();
  res.status(202).json({
    success: true,
    message: `${result.queued} products queued for Meta Catalog synchronization.`,
    data: result,
  });
});

exports.syncProduct = catchAsync(async (req, res) => {
  const job = await enqueueProductSync(sourceType(req.params.sourceType), req.params.id);
  res.status(202).json({
    success: true,
    message: "Product queued for Meta Catalog synchronization.",
    data: { jobId: job.id, status: job.status },
  });
});

exports.retryFailed = catchAsync(async (_req, res) => {
  const result = await retryFailedJobs();
  res.status(202).json({
    success: true,
    message: `${result.queued} failed Meta Catalog jobs queued for retry.`,
    data: result,
  });
});
