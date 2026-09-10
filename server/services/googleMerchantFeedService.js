const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const { availableStockQuantity } = require("../utils/inventory");
const { resolveProductPricing } = require("../utils/productPricing");
const Coupon = require("../models/Coupon");
const { activeCouponFilter, calculateCouponDiscount } = require("./couponService");

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, origin) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (/^https?:\/\//i.test(source)) return source.replace(/^http:\/\//i, "https://");
  return `${origin}${source.startsWith("/") ? "" : "/"}${source}`;
}

function conditionValue(value) {
  return ["new", "refurbished", "used"].includes(value) ? value : "new";
}

function feedProduct(product, origin, stockField, publicOffer = null) {
  const identifier = String(product.slug || product._id || "").trim();
  const image = product.imageUrl || product.images?.find((item) => item?.url)?.url || "";
  const price = resolveProductPricing(product).price;
  const stock = availableStockQuantity(product, stockField);
  const unavailable = /out of stock|not available/i.test(String(product.availability || ""));
  if (!identifier || !image || !Number.isFinite(price) || price <= 0 || stock < 1 || unavailable) return null;

  const id = String(product.sku || product._id || identifier);
  const link = `${origin}/product/${encodeURIComponent(identifier)}`;
  const description = cleanText(
    product.description || product.shortDescription,
    `${product.name} is available from Prakash Electronics.`,
  ).slice(0, 5000);
  const additionalImages = (product.images || [])
    .map((item) => absoluteUrl(item?.url, origin))
    .filter((url) => url && url !== absoluteUrl(image, origin))
    .slice(0, 10);
  const identifierExists = Boolean(product.gtin || (product.brand && product.mpn));
  const rows = [
    "    <item>",
    `      <g:id>${xmlEscape(id)}</g:id>`,
    `      <title>${xmlEscape(cleanText(product.name).slice(0, 150))}</title>`,
    `      <description>${xmlEscape(description)}</description>`,
    `      <link>${xmlEscape(link)}</link>`,
    `      <g:image_link>${xmlEscape(absoluteUrl(image, origin))}</g:image_link>`,
    ...additionalImages.map((url) => `      <g:additional_image_link>${xmlEscape(url)}</g:additional_image_link>`),
    "      <g:availability>in_stock</g:availability>",
    `      <g:price>${price.toFixed(2)} INR</g:price>`,
    publicOffer?.finalPrice < price ? `      <g:sale_price>${Number(publicOffer.finalPrice).toFixed(2)} INR</g:sale_price>` : "",
    publicOffer?.startsAt && publicOffer?.endsAt
      ? `      <g:sale_price_effective_date>${xmlEscape(`${new Date(publicOffer.startsAt).toISOString()}/${new Date(publicOffer.endsAt).toISOString()}`)}</g:sale_price_effective_date>`
      : "",
    `      <g:condition>${conditionValue(product.condition)}</g:condition>`,
    product.brand ? `      <g:brand>${xmlEscape(product.brand)}</g:brand>` : "",
    product.gtin ? `      <g:gtin>${xmlEscape(product.gtin)}</g:gtin>` : "",
    product.mpn ? `      <g:mpn>${xmlEscape(product.mpn)}</g:mpn>` : "",
    product.productType ? `      <g:product_type>${xmlEscape(product.productType)}</g:product_type>` : "",
    product.googleProductCategory ? `      <g:google_product_category>${xmlEscape(product.googleProductCategory)}</g:google_product_category>` : "",
    product.weight?.value ? `      <g:shipping_weight>${xmlEscape(`${product.weight.value} ${product.weight.unit || "kg"}`)}</g:shipping_weight>` : "",
    !identifierExists ? "      <g:identifier_exists>no</g:identifier_exists>" : "",
    "    </item>",
  ].filter(Boolean);
  return rows.join("\n");
}

async function buildGoogleMerchantFeed(origin = "https://prakashshop.in") {
  const safeOrigin = String(origin || "https://prakashshop.in").replace(/\/+$/, "");
  const fields = "name slug shortDescription description mrp discountPercent price quantity stock availability imageUrl images sku brand gtin mpn condition productType googleProductCategory weight isActive";
  const [shopProducts, projectParts, publicCoupons] = await Promise.all([
    ShopProduct.find({ isActive: true }).select(fields).lean(),
    ProjectPart.find({ isActive: true }).select(fields).lean(),
    Coupon.find({ ...activeCouponFilter(), visibility: "public" }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
  ]);
  const bestOffer = (product) => {
    const unitPrice = resolveProductPricing(product).price;
    const item = { sourceType: "shop-product", productId: product._id, productCategory: product.category, lineTotal: unitPrice };
    return publicCoupons.map((coupon) => ({ coupon, result: calculateCouponDiscount(coupon, [item]) }))
      .filter(({ result }) => result.valid)
      .map(({ coupon, result }) => ({ startsAt: coupon.startsAt, endsAt: coupon.endsAt, finalPrice: Math.max(0, Number(unitPrice) - result.discountAmount) }))
      .sort((a, b) => a.finalPrice - b.finalPrice)[0] || null;
  };
  const items = [
    ...shopProducts.map((item) => feedProduct(item, safeOrigin, "quantity", bestOffer(item))),
    ...projectParts.map((item) => feedProduct(item, safeOrigin, "stock")),
  ].filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>Prakash Electronics product feed</title>\n    <link>${xmlEscape(`${safeOrigin}/products`)}</link>\n    <description>Active, purchasable products from Prakash Electronics.</description>\n${items.join("\n")}\n  </channel>\n</rss>\n`;
}

module.exports = { buildGoogleMerchantFeed, feedProduct };
