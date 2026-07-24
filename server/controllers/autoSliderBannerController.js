const AutoSliderBanner = require("../models/AutoSliderBanner");
const ShopProduct = require("../models/ShopProduct");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");
const { clearSitePayloadCache } = require("../services/siteService");

const imageIds = (item) => collectPublicIdsFromSources(item?.imagePublicId, item?.imageUrl);

async function normalizeOrders(target) {
  const items = await AutoSliderBanner.find().sort({ displayOrder: 1, createdAt: -1 }).select("_id displayOrder").lean();
  const current = items.find((item) => String(item._id) === String(target._id));
  if (!current) return;
  const ordered = items.filter((item) => String(item._id) !== String(target._id));
  const at = Math.max(0, Math.min(ordered.length, Number(target.displayOrder || ordered.length + 1) - 1));
  ordered.splice(at, 0, current);
  await AutoSliderBanner.bulkWrite(ordered.map((item, index) => ({ updateOne: { filter: { _id: item._id }, update: { $set: { displayOrder: index + 1 } } } })));
}

exports.listAutoSliderBanners = asyncHandler(async (_req, res) => {
  const [banners, products] = await Promise.all([
    AutoSliderBanner.find().sort({ displayOrder: 1, createdAt: -1 }).lean(),
    ShopProduct.find({ showInHeroSlider: true }).select("name imageUrl imagePublicId shortDescription isActive displayOrder").sort({ displayOrder: 1, name: 1 }).lean(),
  ]);
  res.json({ success: true, data: { banners, products } });
});

exports.createAutoSliderBanner = asyncHandler(async (req, res) => {
  const banner = await AutoSliderBanner.create(req.body);
  await normalizeOrders(banner);
  clearSitePayloadCache();
  res.status(201).json({ success: true, data: banner });
});

exports.updateAutoSliderBanner = asyncHandler(async (req, res) => {
  const previous = await AutoSliderBanner.findById(req.params.id);
  if (!previous) throw new AppError("Banner not found", 404);
  const banner = await AutoSliderBanner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await normalizeOrders(banner);
  const nextIds = new Set(imageIds(banner));
  await deleteImagesStrict(imageIds(previous).filter((id) => !nextIds.has(id)));
  clearSitePayloadCache();
  res.json({ success: true, data: banner });
});

exports.deleteAutoSliderBanner = asyncHandler(async (req, res) => {
  const banner = await AutoSliderBanner.findByIdAndDelete(req.params.id);
  if (!banner) throw new AppError("Banner not found", 404);
  await deleteImagesStrict(imageIds(banner));
  clearSitePayloadCache();
  res.json({ success: true });
});
