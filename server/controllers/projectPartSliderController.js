const ProjectPartSlider = require("../models/ProjectPartSlider");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/asyncHandler");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");

async function deleteCloudinaryImages(publicIds) {
  const ids = [...new Set((publicIds || []).filter(Boolean))];
  if (!ids.length) return;
  await deleteImagesStrict(ids);
}

async function normalizeDisplayOrders(targetSlider) {
  if (!targetSlider?._id) return;
  const items = await ProjectPartSlider.find({})
    .select("_id displayOrder createdAt")
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();
  const targetId = String(targetSlider._id);
  const target = items.find((item) => String(item._id) === targetId);
  if (!target) return;
  const desiredIndex = Math.min(
    items.length - 1,
    Math.max(0, Number(targetSlider.displayOrder || target.displayOrder || items.length) - 1),
  );
  const ordered = items.filter((item) => String(item._id) !== targetId);
  ordered.splice(desiredIndex, 0, target);
  await ProjectPartSlider.bulkWrite(ordered.map((item, index) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { displayOrder: index + 1 } },
    },
  })));
}

// Public API - Get all active sliders
exports.getProjectPartSliders = catchAsync(async (req, res) => {
  const sliders = await ProjectPartSlider.find({ isActive: true })
    .sort({ displayOrder: 1, createdAt: -1 });

  res.json({
    success: true,
    data: sliders,
  });
});

// Admin API - List all sliders
exports.listSliders = catchAsync(async (req, res) => {
  const sliders = await ProjectPartSlider.find()
    .sort({ displayOrder: 1, createdAt: -1 });

  res.json({
    success: true,
    data: sliders,
  });
});

// Admin API - Create slider
exports.createSlider = catchAsync(async (req, res) => {
  const { imageUrl, imagePublicId, title, description, displayOrder, isActive } = req.body;

  const slider = await ProjectPartSlider.create({
    imageUrl: imageUrl || "",
    imagePublicId: imagePublicId || "",
    title: title || "Slider Image",
    description: description || "",
    displayOrder: displayOrder || 0,
    isActive: isActive !== false,
  });
  await normalizeDisplayOrders(slider);

  res.status(201).json({
    success: true,
    data: slider,
  });
});

// Admin API - Update slider
exports.updateSlider = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const slider = await ProjectPartSlider.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!slider) {
    throw new AppError("Slider not found", 404);
  }
  await normalizeDisplayOrders(slider);

  res.json({
    success: true,
    data: slider,
  });
});

// Admin API - Delete slider
exports.deleteSlider = catchAsync(async (req, res) => {
  const { id } = req.params;

  const slider = await ProjectPartSlider.findById(id);

  if (!slider) {
    throw new AppError("Slider not found", 404);
  }

  await deleteCloudinaryImages(
    collectPublicIdsFromSources(slider.imagePublicId, slider.imageUrl),
  );

  await slider.deleteOne();

  res.json({
    success: true,
    message: "Slider deleted successfully",
  });
});
