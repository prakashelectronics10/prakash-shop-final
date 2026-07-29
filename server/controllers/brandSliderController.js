const BrandSlider = require("../models/BrandSlider");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/asyncHandler");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");

async function deleteCloudinaryImages(publicIds) {
  const ids = [...new Set((publicIds || []).filter(Boolean))];
  if (!ids.length) return;
  await deleteImagesStrict(ids);
}

async function normalizeDisplayOrders(targetBrand) {
  if (!targetBrand?._id) return;
  const items = await BrandSlider.find({})
    .select("_id displayOrder createdAt")
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();
  const targetId = String(targetBrand._id);
  const target = items.find((item) => String(item._id) === targetId);
  if (!target) return;
  const desiredIndex = Math.min(
    items.length - 1,
    Math.max(0, Number(targetBrand.displayOrder || target.displayOrder || items.length) - 1),
  );
  const ordered = items.filter((item) => String(item._id) !== targetId);
  ordered.splice(desiredIndex, 0, target);
  await BrandSlider.bulkWrite(ordered.map((item, index) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { displayOrder: index + 1 } },
    },
  })));
}

exports.getBrandSliders = catchAsync(async (req, res) => {
  const brands = await BrandSlider.find({ isActive: true })
    .select("imageUrl name displayOrder")
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
  res.json({
    success: true,
    data: brands,
  });
});

exports.listBrandSliders = catchAsync(async (req, res) => {
  const brands = await BrandSlider.find()
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: brands,
  });
});

exports.createBrandSlider = catchAsync(async (req, res) => {
  const { imageUrl, imagePublicId, name, displayOrder, isActive } = req.body;

  if (!String(imageUrl || "").trim()) {
    throw new AppError("Brand logo image is required", 400);
  }

  const brand = await BrandSlider.create({
    imageUrl: String(imageUrl).trim(),
    imagePublicId: imagePublicId || "",
    name: String(name || "Brand").trim() || "Brand",
    displayOrder: displayOrder || 0,
    isActive: isActive !== false,
  });
  await normalizeDisplayOrders(brand);

  res.status(201).json({
    success: true,
    data: brand,
  });
});

exports.updateBrandSlider = catchAsync(async (req, res) => {
  const { id } = req.params;
  const existing = await BrandSlider.findById(id);
  if (!existing) throw new AppError("Brand logo not found", 404);

  const updateData = { ...req.body };
  if (updateData.name != null) {
    updateData.name = String(updateData.name || "Brand").trim() || "Brand";
  }

  const brand = await BrandSlider.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!brand) throw new AppError("Brand logo not found", 404);

  const nextIds = new Set(collectPublicIdsFromSources(brand.imagePublicId, brand.imageUrl));
  await deleteCloudinaryImages(
    collectPublicIdsFromSources(existing.imagePublicId, existing.imageUrl).filter((imageId) => !nextIds.has(imageId)),
  );
  await normalizeDisplayOrders(brand);

  res.json({
    success: true,
    data: brand,
  });
});

exports.deleteBrandSlider = catchAsync(async (req, res) => {
  const { id } = req.params;
  const brand = await BrandSlider.findById(id);
  if (!brand) throw new AppError("Brand logo not found", 404);

  await brand.deleteOne();
  await deleteCloudinaryImages(collectPublicIdsFromSources(brand.imagePublicId, brand.imageUrl));

  res.json({
    success: true,
    message: "Brand logo deleted successfully",
  });
});
