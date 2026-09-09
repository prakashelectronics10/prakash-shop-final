const PulseAIInstruction = require("../models/PulseAIInstruction");
const BrandSlider = require("../models/BrandSlider");
const ProjectPartSlider = require("../models/ProjectPartSlider");
const AutoSliderBanner = require("../models/AutoSliderBanner");
const { getSitePayload } = require("./siteService");

const CORE_ROUTES = [
  { title: "Home", url: "/", description: "Homepage and the latest shop overview" },
  { title: "Shop Products", url: "/products", description: "Browse all active shop products" },
  { title: "Wiring Accessories", url: "/wiring-parts", description: "Browse wiring products, parts and project accessories" },
  { title: "Repair Booking", url: "/booking", description: "Book appliance and electronics repair support" },
  { title: "Service Details", url: "/learn-more", description: "Learn more about a selected repair service" },
  { title: "Pulse AI", url: "/pulse-ai", description: "AI product and website assistant" },
  { title: "About Us", url: "/about", description: "Our story, experience and reasons to choose the shop" },
  { title: "Contact Us", url: "/contact", description: "Phone, WhatsApp, email, address and map" },
  { title: "Gallery", url: "/gallery", description: "Shop, products and repair-work gallery" },
  { title: "Privacy Policy", url: "/privacy-policy", description: "How customer and website data is handled" },
  { title: "Terms & Conditions", url: "/terms-and-conditions", description: "Ordering, payment, delivery and repair terms" },
  { title: "Cart", url: "/cart", description: "Review selected products" },
  { title: "Checkout", url: "/checkout", description: "Delivery details and secure payment" },
  { title: "Track Order", url: "/orders", description: "Track an order using its Order ID" },
  { title: "Offers & Updates", url: "/#offers", description: "Latest active offers and shop updates" },
  { title: "Shop Highlights", url: "/#shop-highlights", description: "Current shop highlights" },
  { title: "Our Services", url: "/#services", description: "Available repair and support services" },
  { title: "Featured Repairs", url: "/#featured-repairs", description: "Highlighted repair services" },
  { title: "Trending Products", url: "/#trending", description: "Products currently receiving the most interest" },
  { title: "Top Products", url: "/#top-products", description: "Products marked as top picks" },
  { title: "Testimonials", url: "/#testimonials", description: "Current customer testimonials" },
];

const LEGAL_KNOWLEDGE = {
  privacyPolicy: {
    lastUpdated: "7 September 2026",
    route: "/privacy-policy",
    topics: ["information collected for orders, bookings, support and Pulse AI", "payments handled by Razorpay", "service-provider sharing", "storage, security, cookies, retention and customer choices"],
  },
  termsAndConditions: {
    lastUpdated: "7 September 2026",
    route: "/terms-and-conditions",
    topics: ["website use", "product pricing and availability", "orders and Razorpay payment", "delivery and additional charges", "repair bookings", "cancellations, returns and refunds", "third-party services and governing law in India/Jharkhand"],
  },
};

function cleanText(value, max = 700) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function actionSafeTextForModel(item, value, max = 5000) {
  let text = cleanText(value, max);
  const trustedActionUrl = String(item?.linkAction?.url || "").trim();
  if (item?.linkAction?.enabled && trustedActionUrl) {
    text = text.split(trustedActionUrl).join("[trusted action destination]");
  }
  return text;
}

function instructionTextForModel(item, max = 5000) {
  return actionSafeTextForModel(item, item?.instruction, max);
}

function compactValue(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value;
  if (typeof value === "string") return cleanText(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => compactValue(item, depth + 1));
  return Object.entries(value).reduce((result, [key, child]) => {
    if (["_id", "__v", "publicId", "imagePublicId", "iconImagePublicId", "passwordHash"].includes(key)) return result;
    if (/base64/i.test(key)) return result;
    result[key] = compactValue(child, depth + 1);
    return result;
  }, {});
}

function productKnowledge(product) {
  return compactValue({
    name: product.name,
    slug: product.slug,
    category: product.category,
    subCategory: product.subCategory,
    description: product.shortDescription || product.description,
    basePrice: product.price,
    effectivePrice: product.effectivePrice ?? product.price,
    mrp: product.mrp,
    discountPercent: product.discountPercent,
    availability: product.availability,
    stock: product.stockQuantity ?? product.quantity ?? product.stock,
    tags: product.tags,
    specifications: product.specifications,
    isTopProduct: product.isTopProduct,
    isFeatured: product.isFeatured,
    showInHeroSlider: product.showInHeroSlider,
    viewCount: product.viewCount,
    url: `/product/${encodeURIComponent(product.slug || product._id)}`,
    catalog: product.sourceCollection,
    updatedAt: product.updatedAt,
    publicCoupons: (product.publicCoupons || []).map((coupon) => ({
      title: coupon.title,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscountAmount: coupon.maxDiscountAmount,
      minimumSubtotal: coupon.minimumSubtotal,
      discountAmount: coupon.discountAmount,
      finalPrice: coupon.finalPrice,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
    })),
  });
}

function isCurrentPublicOffer(offer = {}, now = new Date()) {
  if (offer.isActive === false) return false;
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const startsAt = offer.startsAt ? new Date(offer.startsAt).getTime() : null;
  const endsAt = offer.endsAt ? new Date(offer.endsAt).getTime() : null;
  if (Number.isFinite(startsAt) && startsAt > timestamp) return false;
  if (Number.isFinite(endsAt) && endsAt <= timestamp) return false;
  return true;
}

function buildAllowedLinks(site, catalogProducts) {
  const links = [...CORE_ROUTES];
  (site.products || []).forEach((service) => {
    if (service.slug) links.push({ title: service.title || "Service Details", url: `/learn-more?service=${encodeURIComponent(service.slug)}`, description: "Service details" });
  });
  const socialLinks = [
    ...(site.contact?.socialLinks || []),
    ...(site.content?.footer?.socialLinks || []),
  ];
  socialLinks.forEach((link) => {
    if (/^https?:\/\//i.test(link.url || "")) {
      links.push({ title: link.title || link.platform || "Social Media", url: link.url, description: `${link.platform || "Social"} profile` });
    }
  });
  (site.heroSlider || []).forEach((item) => {
    const url = String(item.link || "").trim();
    if ((url.startsWith("/") && !url.startsWith("//")) || /^https?:\/\//i.test(url)) {
      links.push({ title: item.title || "Featured Link", url, description: "Configured homepage slider link" });
    }
  });
  return links.filter((item, index, all) => item.url && all.findIndex((other) => other.url === item.url) === index);
}

async function loadActiveInstructions() {
  if (PulseAIInstruction.db.readyState !== 1) return [];
  return PulseAIInstruction.find({ isActive: true })
    .select("title instruction scope target priority linkAction updatedAt")
    .sort({ priority: -1, updatedAt: -1 })
    .lean();
}

function formatInstructions(instructions) {
  if (!instructions.length) return "No additional admin instructions are active.";
  return instructions.map((item, index) => (
    `${index + 1}. [priority ${item.priority}; scope ${item.scope}${item.target ? `; target ${cleanText(item.target, 160)}` : ""}] ${cleanText(item.title, 120)}: ${instructionTextForModel(item)}`
  )).join("\n");
}

function formatLinkActions(instructions) {
  const actions = instructions.filter((item) => item.linkAction?.enabled === true);
  if (!actions.length) return "No admin link actions are active.";

  return [
    "AVAILABLE ADMIN LINK ACTIONS (trusted server IDs; URLs are intentionally hidden):",
    ...actions.map((item) => (
      `- ID ${String(item._id)} | priority ${item.priority} | title: ${actionSafeTextForModel(item, item.linkAction.title, 120)} | trigger/intent: ${actionSafeTextForModel(item, item.linkAction.trigger, 500)}${item.linkAction.description ? ` | description: ${actionSafeTextForModel(item, item.linkAction.description, 240)}` : ""} | instruction context: ${instructionTextForModel(item, 800)}`
    )),
  ].join("\n");
}

function buildWebsiteKnowledge(site, catalogProducts, supplementary = {}, now = new Date()) {
  const shopProducts = (catalogProducts || []).filter((item) => item.sourceCollection === "shop-products");
  const wiringProducts = (catalogProducts || []).filter((item) => item.sourceCollection === "project-parts");
  const topProducts = [...shopProducts, ...wiringProducts]
    .filter((item) => item.isTopProduct)
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  const trendingProducts = [...shopProducts, ...wiringProducts]
    .sort((a, b) => Number(b.viewCount || 0) - Number(a.viewCount || 0) || Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
    .slice(0, 24);
  const content = site.content || {};

  const snapshot = {
    generatedAt: now.toISOString(),
    contentUpdatedAt: site.contentUpdatedAt || "",
    routesAndElements: CORE_ROUTES,
    hero: compactValue(site.hero || {}),
    contactInformation: compactValue(site.contact || {}),
    services: compactValue(site.products || []),
    offersAndRecentUpdates: compactValue((site.offers || []).filter((offer) => isCurrentPublicOffer(offer, now))),
    shopHighlights: compactValue(content.shopHighlights || {}),
    testimonials: compactValue(content.testimonials || {}),
    ourStoryAndAbout: compactValue({ about: content.about || {}, aboutShowcase: content.aboutShowcase || {} }),
    socialMediaLinks: compactValue([...(site.contact?.socialLinks || []), ...(content.footer?.socialLinks || [])]),
    websiteSections: compactValue({
      navbar: content.navbar || {},
      servicesSection: content.servicesSection || {},
      stats: content.stats || {},
      gallery: content.gallery || {},
      contactSection: content.contactSection || {},
      footer: content.footer || {},
      featuredCarousel: content.featuredCarousel || {},
      homepageHeroSlider: site.heroSlider || [],
      brandSlider: supplementary.brandSlider || [],
      wiringAccessoriesSlider: supplementary.projectPartSlider || [],
      autoSliderBanners: supplementary.autoSliderBanners || [],
    }),
    catalogCoverage: {
      shopProducts: shopProducts.length,
      wiringAccessories: wiringProducts.length,
      note: "The complete live catalog, stock, base pricing, current public coupons, after-offer pricing, tags and specifications are included once in the catalog section below this snapshot.",
    },
    topProducts: topProducts.map(productKnowledge),
    trendingProducts: trendingProducts.map(productKnowledge),
    legalPages: LEGAL_KNOWLEDGE,
  };

  return `LIVE WEBSITE KNOWLEDGE SNAPSHOT (database-backed source of truth; never replace it with guesses):\n${JSON.stringify(snapshot)}`;
}

async function getPulseAIKnowledge(catalogProducts = []) {
  const connected = PulseAIInstruction.db.readyState === 1;
  const [site, instructions, brandSlider, projectPartSlider, autoSliderBanners] = await Promise.all([
    getSitePayload(),
    loadActiveInstructions(),
    connected ? BrandSlider.find({ isActive: true }).sort({ displayOrder: 1 }).lean().catch(() => []) : [],
    connected ? ProjectPartSlider.find({ isActive: true }).sort({ displayOrder: 1 }).lean().catch(() => []) : [],
    connected ? AutoSliderBanner.find({ isActive: true }).sort({ displayOrder: 1 }).lean().catch(() => []) : [],
  ]);
  const supplementary = { brandSlider, projectPartSlider, autoSliderBanners };
  return {
    instructions,
    instructionText: formatInstructions(instructions),
    linkActionText: formatLinkActions(instructions),
    websiteKnowledge: buildWebsiteKnowledge(site, catalogProducts, supplementary),
    allowedLinks: buildAllowedLinks(site, catalogProducts),
    serviceCatalog: site.products || [],
  };
}

module.exports = {
  CORE_ROUTES,
  buildWebsiteKnowledge,
  getPulseAIKnowledge,
  isCurrentPublicOffer,
  productKnowledge,
};
