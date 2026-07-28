const mongoose = require("mongoose");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const { isConnected } = require("../config/db");

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
  const url = `${origin}/product-detail/${encodeURIComponent(identifier)}`;
  const title = trimText(product.name, DEFAULT_SITE_NAME, 90);
  const description = trimText(
    product.shortDescription || product.description,
    `${title} is available at Prakash Electronics.`,
    220,
  );
  const rawImage = product.imageUrl || product.images?.find((item) => item?.url)?.url || "/og-image.jpg";
  const image = absoluteUrl(cloudinaryOgImage(rawImage), origin);

  return {
    title,
    description,
    image,
    imageAlt: title,
    url,
    type: "product",
    sourceType,
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
      .select("name slug shortDescription description imageUrl images isActive")
      .maxTimeMS(5000)
      .lean(),
    ProjectPart.findOne(query)
      .select("name slug shortDescription description imageUrl isActive")
      .maxTimeMS(5000)
      .lean(),
  ]);

  if (shopProduct) return serializeProductMeta(shopProduct, { origin, sourceType: "shop-product" });
  if (projectPart) return serializeProductMeta(projectPart, { origin, sourceType: "project-part" });
  return null;
}

module.exports = {
  DEFAULT_DESCRIPTION,
  DEFAULT_SITE_NAME,
  absoluteUrl,
  findProductForMetadata,
};
