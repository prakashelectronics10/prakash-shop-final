const { availableStockQuantity } = require("../utils/inventory");
const { resolveProductPricing } = require("../utils/productPricing");
const {
  formatVariantSummary,
  productHasVariants,
  resolveVariantAvailability,
  resolveVariantImage,
  resolveVariantPricing,
  resolveVariantSku,
  resolveVariantStock,
  selectionLabels,
} = require("../utils/productVariants");

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

function productPath(product, combinationId = "") {
  const identifier = String(product.slug || product._id || "").trim();
  if (!identifier) return "";
  const base = `/product/${encodeURIComponent(identifier)}`;
  return combinationId ? `${base}?v=${encodeURIComponent(combinationId)}` : base;
}

function inferMetaAttributeKey(groupName = "") {
  const name = String(groupName || "").trim().toLowerCase();
  if (/(colour|color)/.test(name)) return "color";
  if (/size/.test(name)) return "size";
  if (/material/.test(name)) return "material";
  if (/pattern|design/.test(name)) return "pattern";
  return "";
}

function buildVariantAttributes(product, combination) {
  const attributes = {};
  const additional = {};
  for (const selection of selectionLabels(product, combination.optionIds || [])) {
    const key = inferMetaAttributeKey(selection.groupName);
    if (key && !attributes[key]) attributes[key] = selection.label;
    else additional[selection.groupName] = selection.label;
  }
  return {
    ...attributes,
    ...(Object.keys(additional).length ? { additional_variant_attributes: additional } : {}),
  };
}

function mapSingleProductToMeta(product, {
  sourceType = "shop-product",
  origin = DEFAULT_ORIGIN,
  combination = null,
  itemGroupId = "",
} = {}) {
  const parentSku = String(product.sku || "").trim().toUpperCase();
  let retailerId = parentSku;
  if (combination) {
    const combinationSku = resolveVariantSku(product, combination);
    retailerId = combinationSku && combinationSku !== parentSku
      ? combinationSku
      : `${parentSku || "PE"}-${String(combination.id || "").slice(-6).toUpperCase()}`;
  }
  const summary = combination ? formatVariantSummary(product, combination.optionIds) : "";
  const name = cleanText(
    summary ? `${product.name} — ${summary}` : product.name,
    "",
    150,
  );
  const description = cleanText(
    [
      product.description || product.shortDescription,
      summary ? `Selected options: ${summary}.` : "",
      "View and select variants on the Prakash Electronics product page.",
    ].filter(Boolean).join(" "),
    name ? `${name} is available from Prakash Electronics.` : "",
    5000,
  );
  const pricing = combination ? resolveVariantPricing(product, combination) : resolveProductPricing(product);
  const sellingMinor = toMinorUnits(pricing.price);
  const mrpMinor = toMinorUnits(pricing.mrp);
  const hasSale = mrpMinor !== null && sellingMinor !== null && mrpMinor > sellingMinor;
  const imageSource = combination
    ? resolveVariantImage(product, combination) || product.imageUrl || product.images?.find((item) => item?.url)?.url
    : product.imageUrl || product.images?.find((item) => item?.url)?.url;
  const imageUrl = toHttpsUrl(imageSource, origin);
  const url = toHttpsUrl(productPath(product, combination?.id || ""), origin);

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
  const inventory = combination
    ? resolveVariantStock(product, combination)
    : availableStockQuantity(product, stockField);
  const availability = combination
    ? (product.isActive !== false && resolveVariantAvailability(product, combination) !== "Out of Stock" ? "in stock" : "out of stock")
    : metaAvailability(product, stockField);

  return {
    retailer_id: retailerId,
    name,
    description,
    availability,
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
    inventory,
    ...(itemGroupId ? { item_group_id: itemGroupId } : {}),
    ...(combination ? buildVariantAttributes(product, combination) : {}),
  };
}

/**
 * Maps a shop/wiring product into one or more Meta Catalog payloads.
 *
 * WhatsApp / Meta Commerce Manager limitation:
 * Meta does not render the website's interactive multi-group variant selector.
 * Supported closest representation: one catalog item per sellable combination,
 * linked by shared `item_group_id`, with color/size/material/pattern when
 * group names match those Meta fields. Each item URL opens the website with
 * `?v=<combinationId>` so the selected combination is restored on the PDP.
 */
function mapProductToMeta(product, options = {}) {
  if (!productHasVariants(product) || options.combination) {
    return mapSingleProductToMeta(product, options);
  }

  const combinations = (product.variantCombinations || []).filter((item) => item && item.isAvailable !== false);
  if (!combinations.length) {
    return mapSingleProductToMeta(product, options);
  }

  const groupId = String(product.sku || product._id || "").trim().toUpperCase();
  return combinations.map((combination) => mapSingleProductToMeta(product, {
    ...options,
    combination,
    itemGroupId: groupId,
  }));
}

function listVariantRetailerIds(product = {}) {
  if (!productHasVariants(product)) return [];
  const parentSku = String(product.sku || "").trim().toUpperCase();
  return (product.variantCombinations || [])
    .map((combination) => {
      const sku = resolveVariantSku(product, combination);
      if (sku && sku !== parentSku) return sku;
      return `${parentSku || "PE"}-${String(combination.id || "").slice(-6).toUpperCase()}`;
    })
    .filter(Boolean);
}

module.exports = {
  MetaProductValidationError,
  mapProductToMeta,
  mapSingleProductToMeta,
  metaAvailability,
  toHttpsUrl,
  toMinorUnits,
  listVariantRetailerIds,
};
