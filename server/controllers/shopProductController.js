const mongoose = require("mongoose");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/asyncHandler");
const slugify = require("../utils/slugify");
const { availableStockQuantity, normalizeStockQuantity } = require("../utils/inventory");
const { applyPricingFields } = require("../utils/productPricing");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");

const SCIENCE_PROJECTS_CATEGORY = "Wiring Accessories";
const LEGACY_SCIENCE_PROJECTS_CATEGORY = "Science Projects and Parts";

function isWiringAccessoriesCategory(category = "") {
  const value = String(category || "").trim();
  return value === SCIENCE_PROJECTS_CATEGORY || value === LEGACY_SCIENCE_PROJECTS_CATEGORY;
}

/** Card/list responses — omit heavy text fields detail pages still need. */
const publicListProductProjection = [
  "name",
  "slug",
  "shortDescription",
  "category",
  "mrp",
  "discountPercent",
  "price",
  "quantity",
  "availability",
  "imageUrl",
  "tags",
  "isActive",
  "showInHeroSlider",
  "isTopProduct",
  "displayOrder",
  "viewCount",
  "createdAt",
].join(" ");

const publicListProjectPartProjection = [
  "name",
  "slug",
  "shortDescription",
  "category",
  "subCategory",
  "mrp",
  "discountPercent",
  "price",
  "stock",
  "availability",
  "imageUrl",
  "tags",
  "isActive",
  "isTopProduct",
  "displayOrder",
  "viewCount",
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

function normalizeAvailability(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low stock") return "Low Stock";
  if (normalized === "not available" || normalized === "out of stock" || normalized === "unavailable") return "Not Available";
  return "In Stock";
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
  if (isWiringAccessoriesCategory(query.category)) return null;
  return buildFilter(query, true);
}

function buildPublicProjectPartFilter(query) {
  if (query.category && !isWiringAccessoriesCategory(query.category)) return null;
  const filter = { isActive: true };

  if (query.search) {
    const searchRegex = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [
      { name: searchRegex },
      { shortDescription: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
      { subCategory: searchRegex },
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
    viewCount: Number(product.viewCount || 0),
    sourceType: "shop-product",
    sourceCollection: "shop-products",
    sourceId: String(product._id || ""),
  };
}

function normalizeProjectPart(part) {
  const originalCategory = part.category || "Wiring Products";
  const originalSubCategory = part.subCategory || "";
  return {
    ...part,
    stock: part.stock ?? 1,
    quantity: part.stock ?? 1,
    stockQuantity: availableStockQuantity(part, "stock"),
    viewCount: Number(part.viewCount || 0),
    category: SCIENCE_PROJECTS_CATEGORY,
    originalCategory,
    originalSubCategory,
    subCategory: originalSubCategory,
    sourceType: "project-part",
    sourceCollection: "project-parts",
    sourceId: String(part._id || ""),
    specifications: [],
    tags: unique([SCIENCE_PROJECTS_CATEGORY, originalCategory, originalSubCategory, ...(part.tags || [])]),
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

async function normalizeShopDisplayOrders(targetProduct) {
  if (!targetProduct?._id) return;
  const items = await ShopProduct.find({})
    .select("_id displayOrder name")
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  const targetId = String(targetProduct._id);
  const target = items.find((item) => String(item._id) === targetId);
  if (!target) return;
  const desiredIndex = Math.min(
    items.length - 1,
    Math.max(0, Number(targetProduct.displayOrder || target.displayOrder || items.length) - 1),
  );
  const ordered = items.filter((item) => String(item._id) !== targetId);
  ordered.splice(desiredIndex, 0, target);
  await ShopProduct.bulkWrite(ordered.map((item, index) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { displayOrder: index + 1 } },
    },
  })));
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
          .select(publicListProductProjection)
          .sort({ displayOrder: 1, name: 1 })
          .limit(fetchLimit)
          .maxTimeMS(5000)
          .lean()
      : Promise.resolve([]),
    projectPartFilter
      ? ProjectPart.find(projectPartFilter)
          .select(publicListProjectPartProjection)
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

  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
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

exports.getTrendingProducts = catchAsync(async (req, res) => {
  const limit = Math.min(positiveInt(req.query.limit, 6), 12);
  const imageFilter = { isActive: true, imageUrl: { $exists: true, $nin: ["", null] } };

  const [shopItems, projectPartItems] = await Promise.all([
    ShopProduct.find(imageFilter)
      .select(publicListProductProjection)
      .sort({ viewCount: -1, displayOrder: 1, name: 1 })
      .limit(limit)
      .maxTimeMS(5000)
      .lean(),
    ProjectPart.find(imageFilter)
      .select(publicListProjectPartProjection)
      .sort({ viewCount: -1, displayOrder: 1, name: 1 })
      .limit(limit)
      .maxTimeMS(5000)
      .lean(),
  ]);

  const items = [
    ...shopItems.map(normalizeShopProduct),
    ...projectPartItems.map(normalizeProjectPart),
  ]
    .sort((a, b) => {
      const viewsA = Number(a.viewCount || 0);
      const viewsB = Number(b.viewCount || 0);
      if (viewsB !== viewsA) return viewsB - viewsA;
      const orderA = Number(a.displayOrder || 0);
      const orderB = Number(b.displayOrder || 0);
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .slice(0, limit);

  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
  res.json({ success: true, data: { items } });
});

exports.getTopProducts = catchAsync(async (req, res) => {
  const limit = Math.min(positiveInt(req.query.limit, 8), 16);
  const topFilter = {
    isActive: true,
    isTopProduct: true,
    imageUrl: { $exists: true, $nin: ["", null] },
  };

  const [shopItems, projectPartItems] = await Promise.all([
    ShopProduct.find(topFilter)
      .select(publicListProductProjection)
      .sort({ displayOrder: 1, name: 1 })
      .limit(limit)
      .maxTimeMS(5000)
      .lean(),
    ProjectPart.find(topFilter)
      .select(publicListProjectPartProjection)
      .sort({ displayOrder: 1, name: 1 })
      .limit(limit)
      .maxTimeMS(5000)
      .lean(),
  ]);

  const items = [
    ...shopItems.map(normalizeShopProduct),
    ...projectPartItems.map(normalizeProjectPart),
  ]
    .sort(sortPublicCatalog)
    .slice(0, limit);

  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
  res.json({ success: true, data: { items } });
});

exports.trackProductView = catchAsync(async (req, res) => {
  const identifier = String(req.params.id || "").trim();
  if (!identifier) throw new AppError("Product id is required", 400);

  const query = mongoose.Types.ObjectId.isValid(identifier)
    ? { _id: identifier, isActive: true }
    : { slug: identifier, isActive: true };

  let updated = await ShopProduct.findOneAndUpdate(
    query,
    { $inc: { viewCount: 1 } },
    { new: true, projection: { _id: 1, slug: 1, viewCount: 1 } },
  ).lean();

  let sourceType = "shop-product";
  if (!updated) {
    updated = await ProjectPart.findOneAndUpdate(
      query,
      { $inc: { viewCount: 1 } },
      { new: true, projection: { _id: 1, slug: 1, viewCount: 1 } },
    ).lean();
    sourceType = "project-part";
  }

  if (!updated) throw new AppError("Product not found", 404);

  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    data: {
      id: String(updated._id),
      slug: updated.slug || "",
      sourceType,
      viewCount: Number(updated.viewCount || 0),
    },
  });
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
  const pricing = applyPricingFields(req.body);
  const product = await ShopProduct.create({
    ...req.body,
    ...pricing,
    slug: req.body.slug || slugify(req.body.name),
    category: req.body.category || "Electronics",
    quantity: normalizeStockQuantity(req.body.quantity, 1),
    availability: normalizeAvailability(req.body.availability),
    tags: req.body.tags || [],
    specifications: req.body.specifications || [],
  });
  await normalizeShopDisplayOrders(product);
  res.status(201).json({ success: true, data: product });
});

exports.updateShopProduct = catchAsync(async (req, res) => {
  const existing = await ShopProduct.findById(req.params.id);
  if (!existing) throw new AppError("Shop product not found", 404);
  const pricing = applyPricingFields(req.body);
  const payload = {
    ...req.body,
    ...pricing,
    slug: req.body.slug || slugify(req.body.name),
    category: req.body.category || "Electronics",
    quantity: normalizeStockQuantity(req.body.quantity, 1),
    tags: req.body.tags || [],
    specifications: req.body.specifications || [],
  };
  if (Object.prototype.hasOwnProperty.call(req.body, "availability")) {
    payload.availability = normalizeAvailability(req.body.availability);
  }
  const product = await ShopProduct.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
  if (!product) throw new AppError("Shop product not found", 404);
  const nextIds = new Set(collectPublicIdsFromSources(product.imagePublicId, product.imageUrl, product.images));
  await deleteCloudinaryImages(collectPublicIdsFromSources(existing.imagePublicId, existing.imageUrl, existing.images).filter((id) => !nextIds.has(id)));
  await normalizeShopDisplayOrders(product);
  res.json({ success: true, data: product });
});

exports.deleteShopProduct = catchAsync(async (req, res) => {
  const product = await ShopProduct.findById(req.params.id);
  if (!product) throw new AppError("Shop product not found", 404);

  await product.deleteOne();
  await deleteCloudinaryImages(collectPublicIdsFromSources(product.imagePublicId, product.imageUrl, product.images));
  res.json({ success: true, message: "Shop product deleted successfully" });
});
