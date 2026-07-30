const AutoSliderBanner = require("../models/AutoSliderBanner");
const ShopProduct = require("../models/ShopProduct");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");
const { clearSitePayloadCache } = require("../services/siteService");

const imageIds = (item) => collectPublicIdsFromSources(item?.imagePublicId, item?.imageUrl);

function resolvePlacement(value, fallback = "hero") {
  const placement = String(value || "").trim();
  return placement === "belowTrending" ? "belowTrending" : fallback;
}

function placementFilter(placement) {
  if (placement === "belowTrending") {
    return { placement: "belowTrending" };
  }
  // Treat missing/legacy placement values as hero banners.
  return { $or: [{ placement: "hero" }, { placement: { $exists: false } }, { placement: null }, { placement: "" }] };
}

async function normalizeOrders(target, placement = "hero") {
  const filter = placementFilter(placement);
  const items = await AutoSliderBanner.find(filter).sort({ displayOrder: 1, createdAt: -1 }).select("_id displayOrder").lean();
  const current = items.find((item) => String(item._id) === String(target._id));
  if (!current) return;
  const ordered = items.filter((item) => String(item._id) !== String(target._id));
  const at = Math.max(0, Math.min(ordered.length, Number(target.displayOrder || ordered.length + 1) - 1));
  ordered.splice(at, 0, current);
  await AutoSliderBanner.bulkWrite(ordered.map((item, index) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { displayOrder: index + 1, placement } },
    },
  })));
}

function sanitizeBannerBody(body = {}, forcedPlacement) {
  const next = { ...body };
  next.placement = forcedPlacement || resolvePlacement(body.placement, "hero");
  next.link = String(body.link || "").trim();
  next.title = String(body.title || "").trim();
  next.alt = String(body.alt || "").trim();
  next.imageUrl = String(body.imageUrl || "").trim();
  if (body.imagePublicId !== undefined) {
    next.imagePublicId = String(body.imagePublicId || "").trim();
  }
  if (body.displayOrder !== undefined) {
    next.displayOrder = Number(body.displayOrder || 0);
  }
  if (body.isActive !== undefined) {
    next.isActive = Boolean(body.isActive);
  }
  return next;
}

async function listBannersForPlacement(placement) {
  return AutoSliderBanner.find(placementFilter(placement)).sort({ displayOrder: 1, createdAt: -1 }).lean();
}

exports.listAutoSliderBanners = asyncHandler(async (_req, res) => {
  const [banners, products] = await Promise.all([
    listBannersForPlacement("hero"),
    ShopProduct.find({ showInHeroSlider: true }).select("name slug imageUrl imagePublicId shortDescription isActive displayOrder").sort({ displayOrder: 1, name: 1 }).lean(),
  ]);
  res.json({ success: true, data: { banners, products } });
});

exports.createAutoSliderBanner = asyncHandler(async (req, res) => {
  const payload = sanitizeBannerBody(req.body, "hero");
  if (!payload.imageUrl) throw new AppError("Banner image is required", 400);
  const banner = await AutoSliderBanner.create(payload);
  await normalizeOrders(banner, "hero");
  clearSitePayloadCache();
  res.status(201).json({ success: true, data: banner });
});

exports.updateAutoSliderBanner = asyncHandler(async (req, res) => {
  const previous = await AutoSliderBanner.findOne({ _id: req.params.id, ...placementFilter("hero") });
  if (!previous) throw new AppError("Banner not found", 404);
  const payload = sanitizeBannerBody(req.body, "hero");
  const banner = await AutoSliderBanner.findByIdAndUpdate(previous._id, payload, { new: true, runValidators: true });
  await normalizeOrders(banner, "hero");
  const nextIds = new Set(imageIds(banner));
  await deleteImagesStrict(imageIds(previous).filter((id) => !nextIds.has(id)));
  clearSitePayloadCache();
  res.json({ success: true, data: banner });
});

exports.deleteAutoSliderBanner = asyncHandler(async (req, res) => {
  const banner = await AutoSliderBanner.findOneAndDelete({ _id: req.params.id, ...placementFilter("hero") });
  if (!banner) throw new AppError("Banner not found", 404);
  await deleteImagesStrict(imageIds(banner));
  clearSitePayloadCache();
  res.json({ success: true });
});

exports.listTrendingBanners = asyncHandler(async (_req, res) => {
  const banners = await listBannersForPlacement("belowTrending");
  res.json({ success: true, data: banners });
});

exports.createTrendingBanner = asyncHandler(async (req, res) => {
  const payload = sanitizeBannerBody(req.body, "belowTrending");
  if (!payload.imageUrl) throw new AppError("Banner image is required", 400);
  const banner = await AutoSliderBanner.create(payload);
  await normalizeOrders(banner, "belowTrending");
  clearSitePayloadCache();
  res.status(201).json({ success: true, data: banner });
});

exports.updateTrendingBanner = asyncHandler(async (req, res) => {
  const previous = await AutoSliderBanner.findOne({ _id: req.params.id, ...placementFilter("belowTrending") });
  if (!previous) throw new AppError("Banner not found", 404);
  const payload = sanitizeBannerBody(req.body, "belowTrending");
  const banner = await AutoSliderBanner.findByIdAndUpdate(previous._id, payload, { new: true, runValidators: true });
  await normalizeOrders(banner, "belowTrending");
  const nextIds = new Set(imageIds(banner));
  await deleteImagesStrict(imageIds(previous).filter((id) => !nextIds.has(id)));
  clearSitePayloadCache();
  res.json({ success: true, data: banner });
});

exports.deleteTrendingBanner = asyncHandler(async (req, res) => {
  const banner = await AutoSliderBanner.findOneAndDelete({ _id: req.params.id, ...placementFilter("belowTrending") });
  if (!banner) throw new AppError("Banner not found", 404);
  await deleteImagesStrict(imageIds(banner));
  clearSitePayloadCache();
  res.json({ success: true });
});
