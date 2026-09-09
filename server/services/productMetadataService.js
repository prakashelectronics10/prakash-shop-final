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
  const pricing = resolveProductPricing(product);
  const stockQuantity = availableStockQuantity(product, sourceType === "project-part" ? "stock" : "quantity");
  const unavailable = stockQuantity < 1
    || /out of stock|not available/i.test(String(product.availability || ""));
  const images = [rawImage, ...(product.images || []).map((item) => item?.url)]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .map((value) => absoluteUrl(value, origin));

  return {
    identifier,
    name,
    title,
    description,
    fullDescription: trimText(product.description || product.shortDescription, description, 5000),
    shortDescription: trimText(product.shortDescription, description, 500),
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
    mrp: Number.isFinite(pricing.mrp) && pricing.mrp >= 0 ? pricing.mrp : null,
    price: Number.isFinite(price) && price >= 0 ? price : null,
    discountPercent: pricing.discountPercent,
    stockQuantity,
    availabilityLabel: unavailable ? "Out of Stock" : String(product.availability || "In Stock"),
    availability: unavailable ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    manufacturer: trimText(product.manufacturer, "", 100),
    warranty: trimText(product.warranty, "", 180),
    specifications: Array.isArray(product.specifications)
      ? product.specifications
        .map((item) => ({
          label: trimText(item?.label, "", 100),
          value: trimText(item?.value, "", 300),
        }))
        .filter((item) => item.label || item.value)
        .slice(0, 50)
      : [],
    shipping: {
      serviceArea: trimText(product.shipping?.serviceArea, "", 180),
      dispatchTime: trimText(product.shipping?.dispatchTime, "", 180),
      deliveryEstimate: trimText(product.shipping?.deliveryEstimate, "", 180),
      chargeNote: trimText(product.shipping?.chargeNote, "", 240),
    },
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
      .select("name slug shortDescription description seoTitle seoDescription category mrp discountPercent price quantity availability imageUrl images tags specifications isActive sku brand gtin mpn manufacturer modelNumber condition warranty shipping")
      .maxTimeMS(5000)
      .lean(),
    ProjectPart.findOne(query)
      .select("name slug shortDescription description seoTitle seoDescription category subCategory mrp discountPercent price stock availability imageUrl images tags specifications isActive sku brand gtin mpn manufacturer modelNumber condition warranty shipping")
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
  serializeProductMeta,
};
