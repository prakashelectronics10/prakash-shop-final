const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");
const ShopProduct = require("../models/ShopProduct");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { resolveProductPricing } = require("../utils/productPricing");
const { deleteImagesStrict } = require("../services/cloudinaryService");
const {
  listPublicCouponsForProduct,
  publicCoupon,
  validateCouponForItems,
} = require("../services/couponService");

function productQuery(identifier) {
  const safe = String(identifier || "").trim();
  return mongoose.Types.ObjectId.isValid(safe)
    ? { _id: safe, isActive: true }
    : { slug: safe.toLowerCase(), isActive: true };
}

async function findPricedProduct(identifier) {
  const product = await ShopProduct.findOne(productQuery(identifier)).lean();
  if (!product) throw new AppError("Product not found", 404);
  const unitPrice = resolveProductPricing(product).price;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new AppError("This product does not have an online price", 409);
  return { product, unitPrice };
}

exports.listAdminCoupons = asyncHandler(async (_req, res) => {
  const coupons = await Coupon.find({})
    .populate("productIds", "name slug category imageUrl")
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();
  res.json({ success: true, data: coupons });
});

exports.createCoupon = asyncHandler(async (req, res) => {
  const payload = req.body.visibility === "private"
    ? { ...req.body, bannerImageUrl: "", bannerImagePublicId: "" }
    : req.body;
  const coupon = await Coupon.create(payload);
  await coupon.populate("productIds", "name slug category imageUrl");
  res.status(201).json({ success: true, data: coupon });
});

exports.updateCoupon = asyncHandler(async (req, res) => {
  const previous = await Coupon.findById(req.params.id).lean();
  if (!previous) throw new AppError("Coupon not found", 404);
  const payload = req.body.visibility === "private"
    ? { ...req.body, bannerImageUrl: "", bannerImagePublicId: "" }
    : req.body;
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!coupon) throw new AppError("Coupon not found", 404);
  const removedImage = previous.bannerImagePublicId
    && previous.bannerImagePublicId !== coupon.bannerImagePublicId;
  if (removedImage) await deleteImagesStrict([previous.bannerImagePublicId]);
  await coupon.populate("productIds", "name slug category imageUrl");
  res.json({ success: true, data: coupon });
});

exports.deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id).lean();
  if (!coupon) throw new AppError("Coupon not found", 404);
  if (coupon.bannerImagePublicId) await deleteImagesStrict([coupon.bannerImagePublicId]);
  res.json({ success: true, data: { id: String(coupon._id) } });
});

exports.getPublicProductCoupons = asyncHandler(async (req, res) => {
  const { product, unitPrice } = await findPricedProduct(req.params.productId);
  const coupons = await listPublicCouponsForProduct(product, unitPrice);
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.json({ success: true, data: { productId: String(product._id), unitPrice, coupons } });
});

exports.validateProductCoupon = asyncHandler(async (req, res) => {
  const { product, unitPrice } = await findPricedProduct(req.body.productId);
  const item = {
    sourceType: "shop-product",
    productId: product._id,
    productCategory: product.category || "Electronics",
    lineTotal: unitPrice,
  };
  const { coupon, result } = await validateCouponForItems(req.body.code, [item]);
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: publicCoupon(coupon, result, unitPrice) });
});
