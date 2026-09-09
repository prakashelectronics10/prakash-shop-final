const mongoose = require("mongoose");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const { isConnected } = require("../config/db");
const { resolveProductPricing } = require("../utils/productPricing");
const { availableStockQuantity } = require("../utils/inventory");
const { listPublicCouponsForProduct } = require("./couponService");

const DEFAULT_SITE_NAME = "Prakash Electronics and Electricals";
const DEFAULT_DESCRIPTION = "Electronics products, accessories, and science project parts from Prakash Electronics.";

function trimText(value, fallback = "", maxLength = 220) {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function absoluteUrl(value, origin) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url.replace(/^http:\/\//i, "https://");
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${origin}${url}`;
  return `${origin}/${url}`;
}

function cloudinaryOgImage(value) {
  const url = String(value || "").trim().replace(/^http:\/\//i, "https://");
  if (!/^https:\/\/res\.cloudinary\.com\//i.test(url) || !url.includes("/image/upload/")) {
    return url;
  }
  if (/\/image\/upload\/[^/]*(?:w_1200|c_fill|f_auto|q_auto)/i.test(url)) {
    return url;
  }
  return url.replace("/image/upload/", "/image/upload/f_auto,q_auto:good,c_fill,g_auto,w_1200,h_630/");
}

function productIdentifier(product = {}) {
  return String(product.slug || product._id || "").trim();
}

function serializeProductMeta(product, { origin, sourceType }) {
  const identifier = productIdentifier(product);
  const url = `${origin}/product/${encodeURIComponent(identifier)}`;
  const name = trimText(product.name, DEFAULT_SITE_NAME, 150);
  const title = trimText(product.seoTitle || product.name, DEFAULT_SITE_NAME, 90);
  const description = trimText(
    product.seoDescription || product.shortDescription || product.description,
    `${title} is available at Prakash Electronics.`,
    220,
  );
  const rawImage = product.imageUrl || product.images?.find((item) => item?.url)?.url || "/og-image.jpg";
  const image = absoluteUrl(cloudinaryOgImage(rawImage), origin);
  const price = resolveProductPricing(product).price;
  const unavailable = availableStockQuantity(product, sourceType === "project-part" ? "stock" : "quantity") < 1
    || /out of stock|not available/i.test(String(product.availability || ""));
  const images = [rawImage, ...(product.images || []).map((item) => item?.url)]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((value) => absoluteUrl(value, origin));

  return {
    name,
    title,
    description,
    image,
    images,
    imageAlt: name,
    url,
    type: "product",
    sourceType,
    sku: String(product.sku || product._id || identifier),
    brand: trimText(product.brand, "", 80),
    gtin: String(product.gtin || "").trim(),
    mpn: String(product.mpn || "").trim(),
    modelNumber: String(product.modelNumber || "").trim(),
    condition: String(product.condition || "new").trim(),
    category: trimText(product.category, sourceType === "project-part" ? "Wiring Accessories" : "Electronics", 80),
    tags: Array.isArray(product.tags) ? product.tags.map((tag) => trimText(tag, "", 60)).filter(Boolean).slice(0, 12) : [],
    price: Number.isFinite(price) && price >= 0 ? price : null,
    availability: unavailable ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
  };
}

async function findProductForMetadata(identifier, origin) {
  const safeIdentifier = String(identifier || "").trim();
  if (!safeIdentifier) return null;
  if (!isConnected()) return null;

  const query = mongoose.Types.ObjectId.isValid(safeIdentifier)
    ? { _id: safeIdentifier, isActive: true }
    : { slug: safeIdentifier, isActive: true };

  const [shopProduct, projectPart] = await Promise.all([
    ShopProduct.findOne(query)
      .select("name slug shortDescription description seoTitle seoDescription category mrp discountPercent price quantity availability imageUrl images tags isActive sku brand gtin mpn modelNumber condition")
      .maxTimeMS(5000)
      .lean(),
    ProjectPart.findOne(query)
      .select("name slug shortDescription description seoTitle seoDescription category subCategory mrp discountPercent price stock availability imageUrl images tags isActive sku brand gtin mpn modelNumber condition")
      .maxTimeMS(5000)
      .lean(),
  ]);

  if (shopProduct) {
    const metadata = serializeProductMeta(shopProduct, { origin, sourceType: "shop-product" });
    metadata.publicOffers = Number.isFinite(metadata.price)
      ? await listPublicCouponsForProduct(shopProduct, metadata.price).catch(() => [])
      : [];
    return metadata;
  }
  if (projectPart) return serializeProductMeta(projectPart, { origin, sourceType: "project-part" });
  return null;
}

module.exports = {
  DEFAULT_DESCRIPTION,
  DEFAULT_SITE_NAME,
  absoluteUrl,
  findProductForMetadata,
};
