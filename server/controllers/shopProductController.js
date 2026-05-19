const mongoose = require("mongoose");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/asyncHandler");
const slugify = require("../utils/slugify");
const { availableStockQuantity, normalizeStockQuantity } = require("../utils/inventory");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");

const SCIENCE_PROJECTS_CATEGORY = "Science Projects and Parts";

const publicProductProjection = [
  "name",
  "slug",
  "shortDescription",
  "description",
  "category",
  "price",
  "quantity",
  "availability",
  "imageUrl",
  "tags",
  "specifications",
  "isActive",
  "displayOrder",
  "createdAt",
].join(" ");

const publicProjectPartProjection = [
  "name",
  "slug",
  "shortDescription",
  "description",
  "category",
  "price",
  "stock",
  "availability",
  "imageUrl",
  "tags",
  "isActive",
  "displayOrder",
  "createdAt",
].join(" ");

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function buildFilter(query, publicOnly = true) {
  const filter = publicOnly ? { isActive: true } : {};
  if (query.category) filter.category = query.category;

  if (query.search) {
    const searchRegex = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [
      { name: searchRegex },
      { shortDescription: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
      { tags: searchRegex },
    ];
  }

  const minPrice = query.minPrice === "" || query.minPrice === undefined ? null : Number(query.minPrice);
  const maxPrice = query.maxPrice === "" || query.maxPrice === undefined ? null : Number(query.maxPrice);
  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
    filter.price = {};
    if (Number.isFinite(minPrice)) filter.price.$gte = minPrice;
    if (Number.isFinite(maxPrice)) filter.price.$lte = maxPrice;
  }

  return filter;
}

function buildPublicShopFilter(query) {
  if (query.category === SCIENCE_PROJECTS_CATEGORY) return null;
  return buildFilter(query, true);
}

function buildPublicProjectPartFilter(query) {
  if (query.category && query.category !== SCIENCE_PROJECTS_CATEGORY) return null;
  const filter = { isActive: true };

  if (query.search) {
    const searchRegex = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [
      { name: searchRegex },
      { shortDescription: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
      { tags: searchRegex },
    ];
  }

  const minPrice = query.minPrice === "" || query.minPrice === undefined ? null : Number(query.minPrice);
  const maxPrice = query.maxPrice === "" || query.maxPrice === undefined ? null : Number(query.maxPrice);
  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
    filter.price = {};
    if (Number.isFinite(minPrice)) filter.price.$gte = minPrice;
    if (Number.isFinite(maxPrice)) filter.price.$lte = maxPrice;
  }

  return filter;
}

function normalizeShopProduct(product) {
  return {
    ...product,
    quantity: product.quantity ?? 1,
    stockQuantity: availableStockQuantity(product, "quantity"),
    sourceType: "shop-product",
    sourceCollection: "shop-products",
    sourceId: String(product._id || ""),
  };
}

function normalizeProjectPart(part) {
  const originalCategory = part.category || "Components";
  return {
    ...part,
    stock: part.stock ?? 1,
    quantity: part.stock ?? 1,
    stockQuantity: availableStockQuantity(part, "stock"),
    category: SCIENCE_PROJECTS_CATEGORY,
    originalCategory,
    sourceType: "project-part",
    sourceCollection: "project-parts",
    sourceId: String(part._id || ""),
    specifications: [],
    tags: unique([SCIENCE_PROJECTS_CATEGORY, originalCategory, ...(part.tags || [])]),
  };
}

function sortPublicCatalog(a, b) {
  const orderA = Number(a.displayOrder || 0);
  const orderB = Number(b.displayOrder || 0);
  if (orderA !== orderB) return orderA - orderB;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

async function deleteCloudinaryImages(publicIds) {
  const ids = [...new Set((publicIds || []).filter(Boolean))];
  if (!ids.length) return;
  await deleteImagesStrict(ids);
}

exports.getShopProducts = catchAsync(async (req, res) => {
  const page = positiveInt(req.query.page, 1);
  const limit = Math.min(positiveInt(req.query.limit, 60), 300);
  const skip = (page - 1) * limit;
  const fetchLimit = Math.min(skip + limit, 300);
  const shopFilter = buildPublicShopFilter(req.query);
  const projectPartFilter = buildPublicProjectPartFilter(req.query);

  const [shopItems, projectPartItems, shopTotal, projectPartTotal] = await Promise.all([
    shopFilter
      ? ShopProduct.find(shopFilter)
          .select(publicProductProjection)
          .sort({ displayOrder: 1, name: 1 })
          .limit(fetchLimit)
          .maxTimeMS(5000)
          .lean()
      : Promise.resolve([]),
    projectPartFilter
      ? ProjectPart.find(projectPartFilter)
          .select(publicProjectPartProjection)
          .sort({ displayOrder: 1, name: 1 })
          .limit(fetchLimit)
          .maxTimeMS(5000)
          .lean()
      : Promise.resolve([]),
    shopFilter ? ShopProduct.countDocuments(shopFilter) : Promise.resolve(0),
    projectPartFilter ? ProjectPart.countDocuments(projectPartFilter) : Promise.resolve(0),
  ]);

  const merged = [
    ...shopItems.map(normalizeShopProduct),
    ...projectPartItems.map(normalizeProjectPart),
  ].sort(sortPublicCatalog);
  const items = merged.slice(skip, skip + limit);
  const total = shopTotal + projectPartTotal;

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } });
});

exports.getShopProductById = catchAsync(async (req, res) => {
  const identifier = req.params.id;
  const query = mongoose.Types.ObjectId.isValid(identifier)
    ? { _id: identifier, isActive: true }
    : { slug: identifier, isActive: true };
  const product = await ShopProduct.findOne(query).maxTimeMS(5000).lean();
  if (product) {
    res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    res.json({ success: true, data: normalizeShopProduct(product) });
    return;
  }

  const part = await ProjectPart.findOne(query).maxTimeMS(5000).lean();
  if (!part) throw new AppError("Shop product not found", 404);
  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
  res.json({ success: true, data: normalizeProjectPart(part) });
});

exports.getShopProductCategories = catchAsync(async (_req, res) => {
  const [categories, hasProjectParts] = await Promise.all([
    ShopProduct.distinct("category", { isActive: true }),
    ProjectPart.exists({ isActive: true }),
  ]);
  const mergedCategories = unique([
    ...categories,
    hasProjectParts ? SCIENCE_PROJECTS_CATEGORY : "",
  ]).sort();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json({ success: true, data: mergedCategories });
});

exports.listShopProducts = catchAsync(async (req, res) => {
  const page = positiveInt(req.query.page, 1);
  const limit = Math.min(positiveInt(req.query.limit, 100), 200);
  const filter = buildFilter(req.query, false);
  const [items, total] = await Promise.all([
    ShopProduct.find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ShopProduct.countDocuments(filter),
  ]);

  res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } });
});

exports.createShopProduct = catchAsync(async (req, res) => {
  const product = await ShopProduct.create({
    ...req.body,
    slug: req.body.slug || slugify(req.body.name),
    category: req.body.category || "Electronics",
    price: req.body.price === "" ? null : req.body.price,
    quantity: normalizeStockQuantity(req.body.quantity, 1),
    tags: req.body.tags || [],
    specifications: req.body.specifications || [],
  });
  res.status(201).json({ success: true, data: product });
});

exports.updateShopProduct = catchAsync(async (req, res) => {
  const payload = {
    ...req.body,
    slug: req.body.slug || slugify(req.body.name),
    category: req.body.category || "Electronics",
    price: req.body.price === "" ? null : req.body.price,
    quantity: normalizeStockQuantity(req.body.quantity, 1),
    tags: req.body.tags || [],
    specifications: req.body.specifications || [],
  };
  const product = await ShopProduct.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
  if (!product) throw new AppError("Shop product not found", 404);
  res.json({ success: true, data: product });
});

exports.deleteShopProduct = catchAsync(async (req, res) => {
  const product = await ShopProduct.findById(req.params.id);
  if (!product) throw new AppError("Shop product not found", 404);

  await deleteCloudinaryImages(
    collectPublicIdsFromSources(product.imagePublicId, product.imageUrl, product.images),
  );

  await product.deleteOne();
  res.json({ success: true, message: "Shop product deleted successfully" });
});
