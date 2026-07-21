const ProjectPart = require("../models/ProjectPart");
const mongoose = require("mongoose");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/asyncHandler");
const { normalizeStockQuantity } = require("../utils/inventory");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAvailability(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low stock") return "Low Stock";
  if (normalized === "not available" || normalized === "out of stock" || normalized === "unavailable") return "Not Available";
  return "In Stock";
}

async function deleteCloudinaryImages(publicIds) {
  const ids = [...new Set((publicIds || []).filter(Boolean))];
  if (!ids.length) return;
  await deleteImagesStrict(ids);
}

async function normalizeDisplayOrders(targetPart) {
  if (!targetPart?._id) return;
  const items = await ProjectPart.find({})
    .select("_id displayOrder name")
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  const targetId = String(targetPart._id);
  const target = items.find((item) => String(item._id) === targetId);
  if (!target) return;
  const desiredIndex = Math.min(
    items.length - 1,
    Math.max(0, Number(targetPart.displayOrder || target.displayOrder || items.length) - 1),
  );
  const ordered = items.filter((item) => String(item._id) !== targetId);
  ordered.splice(desiredIndex, 0, target);
  await ProjectPart.bulkWrite(ordered.map((item, index) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { displayOrder: index + 1 } },
    },
  })));
}

// Public API - Get all project parts
exports.getProjectParts = catchAsync(async (req, res) => {
  const { category, search, isActive = "true", sort = "displayOrder" } = req.query;
  const limit = Math.min(positiveInt(req.query.limit, 50), 200);
  const sortField = ["displayOrder", "name", "createdAt", "price"].includes(sort) ? sort : "displayOrder";

  const query = { isActive: String(isActive) === "true" };

  if (category) {
    query.category = category;
  }

  if (search) {
    query.$text = { $search: search };
  }

  const parts = await ProjectPart.find(query)
    .select("name slug description shortDescription category price stock availability imageUrl tags isActive isFeatured displayOrder createdAt")
    .sort({ [sortField]: 1, displayOrder: 1, name: 1 })
    .limit(limit)
    .maxTimeMS(5000)
    .lean();

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({
    success: true,
    data: { items: parts, total: parts.length },
  });
});

// Public API - Get single project part by slug
exports.getProjectPartBySlug = catchAsync(async (req, res) => {
  const identifier = req.params.slug;
  const query = mongoose.Types.ObjectId.isValid(identifier)
    ? { _id: identifier, isActive: true }
    : { slug: identifier, isActive: true };
  const part = await ProjectPart.findOne(query).maxTimeMS(5000).lean();

  if (!part) {
    throw new AppError("Project part not found", 404);
  }

  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
  res.json({
    success: true,
    data: part,
  });
});

// Admin API - List all project parts
exports.listProjectParts = catchAsync(async (req, res) => {
  const { search = "", category = "" } = req.query;
  const limit = Math.min(positiveInt(req.query.limit, 100), 200);
  const page = positiveInt(req.query.page, 1);

  const query = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
    ];
  }

  if (category) {
    query.category = category;
  }

  const parts = await ProjectPart.find(query)
    .sort({ displayOrder: 1, name: 1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .lean();

  const total = await ProjectPart.countDocuments(query);

  res.json({
    success: true,
    data: {
      items: parts,
      total,
      page,
      pages: Math.ceil(total / limit),
    },
  });
});

// Admin API - Create project part
exports.createProjectPart = catchAsync(async (req, res) => {
  const {
    name,
    slug,
    description,
    shortDescription,
    category,
    price,
    stock,
    availability,
    imageUrl,
    imagePublicId,
    tags,
    isActive,
    isFeatured,
    displayOrder,
  } = req.body;

  const part = await ProjectPart.create({
    name,
    slug,
    description,
    shortDescription,
    category: category || "Components",
    price,
    stock: normalizeStockQuantity(stock, 1),
    availability: normalizeAvailability(availability),
    imageUrl: imageUrl || "",
    imagePublicId: imagePublicId || "",
    tags: tags || [],
    isActive: isActive !== false,
    isFeatured: isFeatured || false,
    displayOrder: displayOrder || 0,
  });
  await normalizeDisplayOrders(part);

  res.status(201).json({
    success: true,
    data: part,
  });
});

// Admin API - Update project part
exports.updateProjectPart = catchAsync(async (req, res) => {
  const { id } = req.params;
  const existing = await ProjectPart.findById(id);
  if (!existing) throw new AppError("Project part not found", 404);
  const updateData = {
    ...req.body,
    stock: normalizeStockQuantity(req.body.stock ?? req.body.quantity, 1),
  };
  if (Object.prototype.hasOwnProperty.call(req.body, "availability")) {
    updateData.availability = normalizeAvailability(req.body.availability);
  }

  const part = await ProjectPart.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!part) {
    throw new AppError("Project part not found", 404);
  }
  const nextIds = new Set(collectPublicIdsFromSources(part.imagePublicId, part.imageUrl));
  await deleteCloudinaryImages(collectPublicIdsFromSources(existing.imagePublicId, existing.imageUrl).filter((imageId) => !nextIds.has(imageId)));
  await normalizeDisplayOrders(part);

  res.json({
    success: true,
    data: part,
  });
});

// Admin API - Delete project part
exports.deleteProjectPart = catchAsync(async (req, res) => {
  const { id } = req.params;

  const part = await ProjectPart.findById(id);

  if (!part) {
    throw new AppError("Project part not found", 404);
  }

  await part.deleteOne();
  await deleteCloudinaryImages(collectPublicIdsFromSources(part.imagePublicId, part.imageUrl));

  res.json({
    success: true,
    message: "Project part deleted successfully",
  });
});

// Get categories for project parts
exports.getProjectPartCategories = catchAsync(async (req, res) => {
  const categories = await ProjectPart.distinct("category", { isActive: true });

  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json({
    success: true,
    data: categories,
  });
});
