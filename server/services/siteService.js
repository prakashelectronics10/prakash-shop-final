const Analytics = require("../models/Analytics");
const Category = require("../models/Category");
const ContactInfo = require("../models/ContactInfo");
const HeroSection = require("../models/HeroSection");
const Offer = require("../models/Offer");
const Product = require("../models/Product");
const SiteContent = require("../models/SiteContent");
const WebSetting = require("../models/WebSetting");
const AutoSliderBanner = require("../models/AutoSliderBanner");
const ShopProduct = require("../models/ShopProduct");
const { isConnected } = require("../config/db");
const { categories, products, hero, contact, siteContent, offers } = require("../data/defaultSeed");
const { normalizeSettings } = require("../utils/webSettings");
const { normalizePublicContact } = require("../utils/contactDefaults");

const SITE_CACHE_TTL = Number(process.env.SITE_CACHE_TTL_MS || 60 * 1000);
let sitePayloadCache = null;
let sitePayloadCacheExpiresAt = 0;
let htmlShellMetaCache = null;
let htmlShellMetaExpiresAt = 0;

const productListProjection = [
  "title",
  "slug",
  "shortDescription",
  "description",
  "price",
  "originalPrice",
  "category",
  "categoryName",
  "iconName",
  "iconImageUrl",
  "badge",
  "highlights",
  "imageUrl",
  "detail",
  "ctaLabel",
  "isActive",
  "isFeatured",
  "displayOrder",
  "createdAt",
  "updatedAt",
].join(" ");

function stripSeedOnlyFields(product) {
  const { categorySlug, ...payload } = product;
  return payload;
}

function normalizeTestimonialsContent(value = {}) {
  return {
    ...value,
    items: (value.items || []).filter((item = {}) => item.isActive !== false).map((item = {}) => {
      const text = String(item.text || item.quote || item.review || "").trim();
      const imageUrl = item.imageUrl || item.photoUrl || item.url || "";
      const name = String(item.name || "").trim();
      const avatar = item.avatar || name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return {
        ...item,
        text,
        quote: text,
        review: text,
        imageUrl,
        photoUrl: imageUrl,
        avatar,
        rating: Number(item.rating || 5),
      };
    }),
  };
}

function normalizeGalleryContent(value = {}) {
  return {
    ...value,
    items: (value.items || [])
      .filter((item = {}) => item.isActive !== false)
      .map((item = {}, index) => ({
        ...item,
        title: item.title || item.label || `Gallery image ${index + 1}`,
        label: item.label || item.title || item.alt || `Gallery image ${index + 1}`,
        description: item.description || item.desc || "",
        src: item.src || item.imageUrl || item.url || "",
        url: item.url || item.imageUrl || item.src || "",
        imageUrl: item.imageUrl || item.src || item.url || "",
        size: item.size || item.imageSize || "square",
        displayOrder: Number(item.displayOrder ?? index),
      }))
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)),
  };
}

function normalizeAboutContent(value = {}) {
  return {
    ...value,
    reasons: (value.reasons || [])
      .filter((item = {}) => item.isActive !== false)
      .map((item = {}, index) => ({
        ...item,
        description: item.description || item.desc || "",
        desc: item.desc || item.description || "",
        displayOrder: Number(item.displayOrder ?? index),
      }))
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)),
  };
}

function normalizeFooterContent(value = {}) {
  return {
    ...value,
    socialLinks: (value.socialLinks || [])
      .filter((item = {}) => item.url || item.platform || item.title)
      .map((item = {}) => {
        const platform = String(item.platform || item.title || "").trim();
        return {
          ...item,
          title: item.title || platform,
          platform,
          iconName: item.iconName || item.icon || platform || "Website",
          iconImageUrl: item.iconImageUrl || item.iconUrl || "",
          iconImagePublicId: item.iconImagePublicId || "",
        };
      }),
  };
}

function normalizeContentPayload(content = {}) {
  return {
    ...content,
    gallery: normalizeGalleryContent(content.gallery || {}),
    about: normalizeAboutContent(content.about || {}),
    testimonials: normalizeTestimonialsContent(content.testimonials || {}),
    footer: normalizeFooterContent(content.footer || {}),
  };
}

function getFallbackSitePayload() {
  return {
    hero,
    contact: normalizePublicContact(contact),
    products: products.map(stripSeedOnlyFields),
    categories,
    offers,
    content: normalizeContentPayload(siteContent),
    webSettings: normalizeSettings(null),
    heroSlider: [],
    isFallback: true,
  };
}

async function getSitePayload() {
  const now = Date.now();
  if (sitePayloadCache && now < sitePayloadCacheExpiresAt) {
    return sitePayloadCache;
  }

  if (!isConnected()) {
    return getFallbackSitePayload();
  }

  let docs;
  try {
    docs = await Promise.all([
      HeroSection.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean(),
      ContactInfo.findOne().sort({ updatedAt: -1 }).lean(),
      Product.find({ isActive: true })
        .select(productListProjection)
        .populate("category", "name slug")
        .sort({ displayOrder: 1, createdAt: -1 })
        .maxTimeMS(5000)
        .lean(),
      Category.find({ isActive: true }).select("name slug description imageUrl displayOrder updatedAt").sort({ displayOrder: 1, name: 1 }).lean(),
      Offer.find({ isActive: true })
        .select("title description code imageUrl ctaLabel ctaHref startsAt endsAt displayOrder updatedAt")
        .sort({ displayOrder: 1, createdAt: -1 })
        .lean(),
      SiteContent.find({}).lean(),
      WebSetting.findOne({ key: "global" }).lean(),
      AutoSliderBanner.find({ isActive: true }).select("imageUrl title alt link displayOrder").sort({ displayOrder: 1, createdAt: -1 }).lean(),
      ShopProduct.find({ isActive: true, showInHeroSlider: true }).select("name slug imageUrl shortDescription displayOrder").sort({ displayOrder: 1, name: 1 }).lean(),
    ]);
  } catch (error) {
    console.error("Unable to load site data from MongoDB, using fallback content:", error.message);
    return getFallbackSitePayload();
  }

  const [heroDoc, contactDoc, productDocs, categoryDocs, offerDocs, contentDocs, webSettingsDoc, bannerDocs, heroProductDocs] = docs;

  const content = contentDocs.length
    ? contentDocs.reduce((acc, doc) => {
        acc[doc.key] = doc.value;
        return acc;
      }, {})
    : siteContent;

  const payload = {
    hero: heroDoc || hero,
    contact: normalizePublicContact(contactDoc || contact),
    products: productDocs.length ? productDocs : products.map(stripSeedOnlyFields),
    categories: categoryDocs.length ? categoryDocs : categories,
    offers: offerDocs.length ? offerDocs : offers,
    content: normalizeContentPayload(content),
    webSettings: normalizeSettings(webSettingsDoc),
    heroSlider: [
      ...bannerDocs.map((banner) => ({
        id: String(banner._id),
        imageUrl: banner.imageUrl,
        title: banner.title,
        alt: banner.alt || banner.title,
        link: String(banner.link || "").trim(),
        displayOrder: banner.displayOrder,
        source: "banner",
      })),
      ...heroProductDocs.filter((product) => product.imageUrl).map((product) => {
        const productId = String(product.slug || product._id || "").trim();
        return {
          id: String(product._id),
          imageUrl: product.imageUrl,
          title: product.name,
          alt: product.name,
          description: product.shortDescription,
          link: productId ? `/product-detail/${encodeURIComponent(productId)}` : "",
          displayOrder: product.displayOrder,
          source: "product",
        };
      }),
    ],
    isFallback: !contentDocs.length,
  };

  sitePayloadCache = payload;
  sitePayloadCacheExpiresAt = now + SITE_CACHE_TTL;
  return payload;
}

function clearSitePayloadCache() {
  sitePayloadCache = null;
  sitePayloadCacheExpiresAt = 0;
  htmlShellMetaCache = null;
  htmlShellMetaExpiresAt = 0;
}

/** Lightweight meta for SPA HTML injection (favicon / OG) — avoids 9-query site payload on every HTML hit. */
async function getHtmlShellSiteMeta() {
  const now = Date.now();
  if (sitePayloadCache && now < sitePayloadCacheExpiresAt) {
    return { webSettings: sitePayloadCache.webSettings || normalizeSettings(null) };
  }
  if (htmlShellMetaCache && now < htmlShellMetaExpiresAt) {
    return htmlShellMetaCache;
  }

  if (!isConnected()) {
    const payload = { webSettings: normalizeSettings(null) };
    htmlShellMetaCache = payload;
    htmlShellMetaExpiresAt = now + SITE_CACHE_TTL;
    return payload;
  }

  const webSettingsDoc = await WebSetting.findOne().lean().catch(() => null);
  const payload = { webSettings: normalizeSettings(webSettingsDoc) };
  htmlShellMetaCache = payload;
  htmlShellMetaExpiresAt = now + SITE_CACHE_TTL;
  return payload;
}

async function incrementFormSubmission() {
  if (!isConnected()) {
    return null;
  }

  const doc = await Analytics.findOneAndUpdate(
    { key: "global" },
    { $inc: { totalFormSubmissions: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return doc.totalFormSubmissions;
}

module.exports = { getSitePayload, getHtmlShellSiteMeta, incrementFormSubmission, getFallbackSitePayload, clearSitePayloadCache };
