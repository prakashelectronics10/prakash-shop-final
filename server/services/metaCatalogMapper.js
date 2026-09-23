const { availableStockQuantity } = require("../utils/inventory");
const { resolveProductPricing } = require("../utils/productPricing");

const DEFAULT_ORIGIN = "https://prakashshop.in";

class MetaProductValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetaProductValidationError";
    this.retryable = false;
  }
}

function cleanText(value, fallback = "", maxLength = 5000) {
  return String(value || fallback).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function toHttpsUrl(value, origin = DEFAULT_ORIGIN) {
  const source = String(value || "").trim();
  if (!source) return "";
  let parsed;
  try {
    parsed = new URL(source, origin);
  } catch (_error) {
    return "";
  }
  if (parsed.protocol !== "https:") return "";
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return "";
  return parsed.toString();
}

function toMinorUnits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round((amount + Number.EPSILON) * 100);
}

function metaAvailability(product, stockField) {
  const stock = availableStockQuantity(product, stockField);
  const unavailable = /out of stock|not available|unavailable|discontinued/i.test(String(product.availability || ""));
  return product.isActive !== false && stock > 0 && !unavailable ? "in stock" : "out of stock";
}

function metaCondition(value) {
  return ["new", "refurbished", "used"].includes(value) ? value : "new";
}

function productPath(product) {
  const identifier = String(product.slug || product._id || "").trim();
  return identifier ? `/product/${encodeURIComponent(identifier)}` : "";
}

function mapProductToMeta(product, { sourceType = "shop-product", origin = DEFAULT_ORIGIN } = {}) {
  const retailerId = String(product.sku || "").trim().toUpperCase();
  const name = cleanText(product.name, "", 150);
  const description = cleanText(
    product.description || product.shortDescription,
    name ? `${name} is available from Prakash Electronics.` : "",
    5000,
  );
  const pricing = resolveProductPricing(product);
  const sellingMinor = toMinorUnits(pricing.price);
  const mrpMinor = toMinorUnits(pricing.mrp);
  const hasSale = mrpMinor !== null && sellingMinor !== null && mrpMinor > sellingMinor;
  const imageUrl = toHttpsUrl(product.imageUrl || product.images?.find((item) => item?.url)?.url, origin);
  const url = toHttpsUrl(productPath(product), origin);

  if (!retailerId) throw new MetaProductValidationError("A stable SKU is required for Meta Catalog sync.");
  if (!name) throw new MetaProductValidationError(`Product ${retailerId} has no name.`);
  if (!description) throw new MetaProductValidationError(`Product ${retailerId} has no description.`);
  if (sellingMinor === null || sellingMinor <= 0) throw new MetaProductValidationError(`Product ${retailerId} needs a selling price greater than zero.`);
  if (!imageUrl) throw new MetaProductValidationError(`Product ${retailerId} needs a public HTTPS image URL.`);
  if (!url) throw new MetaProductValidationError(`Product ${retailerId} needs a public HTTPS product URL.`);

  const additionalImageUrls = (product.images || [])
    .map((item) => toHttpsUrl(item?.url, origin))
    .filter((item, index, list) => item && item !== imageUrl && list.indexOf(item) === index)
    .slice(0, 20);
  const stockField = sourceType === "project-part" ? "stock" : "quantity";
  const brand = cleanText(product.brand || product.manufacturer || (sourceType === "project-part" ? product.subCategory : ""), "", 100);

  return {
    retailer_id: retailerId,
    name,
    description,
    availability: metaAvailability(product, stockField),
    condition: metaCondition(product.condition),
    price: hasSale ? mrpMinor : sellingMinor,
    ...(hasSale ? { sale_price: sellingMinor } : {}),
    currency: "INR",
    url,
    image_url: imageUrl,
    ...(additionalImageUrls.length ? { additional_image_urls: additionalImageUrls } : {}),
    ...(brand ? { brand } : {}),
    ...(product.gtin ? { gtin: String(product.gtin).trim() } : {}),
    ...(product.mpn ? { manufacturer_part_number: String(product.mpn).trim() } : {}),
    ...(product.productType || product.category
      ? { product_type: cleanText(product.productType || product.category, "", 750) }
      : {}),
    visibility: product.isActive === false ? "staging" : "published",
    inventory: availableStockQuantity(product, stockField),
  };
}

module.exports = {
  MetaProductValidationError,
  mapProductToMeta,
  metaAvailability,
  toHttpsUrl,
  toMinorUnits,
};
