const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const { isConnected } = require("./config/db");
const env = require("./config/env");
const AppError = require("./utils/AppError");
const { logger } = require("./utils/logger");
const { requireAdmin } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const mobileAuthRoutes = require("./routes/mobileAuthRoutes");
const mobileRoutes = require("./routes/mobileRoutes");
const discussionRoutes = require("./routes/discussionRoutes");
const fileRoutes = require("./routes/fileRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const invoicePublicRoutes = require("./routes/invoicePublicRoutes");
const { publicRouter, analyticsRouter } = require("./routes/publicRoutes");
const projectPartRoutes = require("./routes/projectPartRoutes");
const scienceAIRoutes = require("./routes/scienceAIRoutes");
const shopProductRoutes = require("./routes/shopProductRoutes");
const brandSliderRoutes = require("./routes/brandSliderRoutes");
const { getAppSettings, updateAppLogo, updateProfileImage } = require("./controllers/mobileController");
const { upload } = require("./controllers/uploadController");
const { getSitePayload, getHtmlShellSiteMeta } = require("./services/siteService");
const { isEmailConfigured } = require("./services/mailService");
const { configureCloudinary } = require("./config/cloudinary");
const { findProductForMetadata, absoluteUrl } = require("./services/productMetadataService");

const app = express();
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
});

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", "https://prakashshop.in", "https://www.prakashshop.in", "https://formspree.io"],
        fontSrc: ["'self'", "https:", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://images.unsplash.com",
          "https://maps.gstatic.com",
          "https://*.googleusercontent.com",
        ],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use("/api", writeLimiter);

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".onrender.com");
  } catch (_error) {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        return callback(null, true);
      }
      logger.warn("cors.blocked_origin", { origin });
      return callback(new AppError(`CORS blocked origin: ${origin}`, 403));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    status: "ok",
    database: isConnected() ? "connected" : "disconnected",
    email: isEmailConfigured() ? "configured" : "not_configured",
    cloudinary: configureCloudinary() ? "configured" : "not_configured",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/public", publicRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/auth", authRoutes);
app.post("/api/mobile-auth/profile-image", requireAdmin, upload.single("image"), updateProfileImage);
app.post("/api/mobile/profile-image", requireAdmin, upload.single("image"), updateProfileImage);
app.post("/api/admin/profile-image", requireAdmin, upload.single("image"), updateProfileImage);
app.get("/api/mobile-auth/app-settings", getAppSettings);
app.get("/api/mobile/app-settings", getAppSettings);
app.post("/api/mobile-auth/app-settings/logo", requireAdmin, upload.single("image"), updateAppLogo);
app.post("/api/mobile/app-settings/logo", requireAdmin, upload.single("image"), updateAppLogo);
app.post("/api/admin/app-settings/logo", requireAdmin, upload.single("image"), updateAppLogo);
app.use("/api/mobile-auth", mobileAuthRoutes);
app.use("/api/mobile", mobileRoutes);
app.use("/api/discussion", requireAdmin, discussionRoutes);
app.use("/api/files", requireAdmin, fileRoutes);
app.use("/api/invoices/public", invoicePublicRoutes);
app.use("/api/invoices", requireAdmin, invoiceRoutes);
app.use("/api/admin", requireAdmin, adminRoutes);
app.use("/api/project-parts", projectPartRoutes);
app.use("/api/shop-products", shopProductRoutes);
app.use("/api/brand-sliders", brandSliderRoutes);
app.use("/api/science-ai", scienceAIRoutes);

app.get(["/science-ai", "/science-ai/"], (_req, res) => {
  res.redirect(301, "/pulse-ai");
});

app.get(["/projects-parts", "/projects-parts/"], (_req, res) => {
  res.redirect(301, "/wiring-parts");
});

app.get(["/projects-parts/product-detail", "/projects-parts/product-detail/"], (_req, res) => {
  res.redirect(301, "/wiring-parts/product-detail");
});

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapUrlEntry(loc, lastmod, changefreq = "weekly", priority = "0.8") {
  return [
    "  <url>",
    `    <loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>` : "",
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].filter(Boolean).join("\n");
}

app.get("/sitemap.xml", async (req, res, next) => {
  try {
    const origin = "https://www.prakashshop.in";
    const today = new Date().toISOString().slice(0, 10);
    const site = await getSitePayload().catch(() => null);
    const ShopProduct = require("./models/ShopProduct");
    const ProjectPart = require("./models/ProjectPart");

    const [shopProducts, projectParts] = await Promise.all([
      isConnected()
        ? ShopProduct.find({ isActive: true }).select("slug _id updatedAt").sort({ updatedAt: -1 }).limit(500).lean().catch(() => [])
        : [],
      isConnected()
        ? ProjectPart.find({ isActive: true }).select("slug _id updatedAt").sort({ updatedAt: -1 }).limit(500).lean().catch(() => [])
        : [],
    ]);

    const staticPaths = [
      { path: "/", priority: "1.0", changefreq: "daily" },
      { path: "/pulse-ai", priority: "0.95", changefreq: "weekly" },
      { path: "/booking", priority: "0.95", changefreq: "weekly" },
      { path: "/products", priority: "0.95", changefreq: "daily" },
      { path: "/wiring-parts", priority: "0.9", changefreq: "daily" },
      { path: "/?page=learn-more&service=quick-repair-booking", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=lcd-led-tv-repair", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=ceiling-fan-repair", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=cooler-repair", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=ac-repairing", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=speaker-home-theater", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=home-appliances", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=wiring-accessories", priority: "0.8", changefreq: "monthly" },
      { path: "/?page=learn-more&service=accessories-sales", priority: "0.75", changefreq: "monthly" },
    ];

    const entries = [
      ...staticPaths.map((item) => ({
        loc: `${origin}${item.path}`,
        lastmod: today,
        changefreq: item.changefreq,
        priority: item.priority,
      })),
      ...((site?.offers || []).length
        ? [{ loc: `${origin}/#offers`, lastmod: today, changefreq: "daily", priority: "0.7" }]
        : []),
      ...shopProducts.map((product) => {
        const id = product.slug || product._id;
        const updated = product.updatedAt ? new Date(product.updatedAt).toISOString().slice(0, 10) : today;
        return {
          loc: `${origin}/product-detail/${encodeURIComponent(String(id))}`,
          lastmod: updated,
          changefreq: "weekly",
          priority: "0.85",
        };
      }),
      ...projectParts.map((product) => {
        const id = product.slug || product._id;
        const updated = product.updatedAt ? new Date(product.updatedAt).toISOString().slice(0, 10) : today;
        return {
          loc: `${origin}/product-detail/${encodeURIComponent(String(id))}`,
          lastmod: updated,
          changefreq: "weekly",
          priority: "0.8",
        };
      }),
    ];

    const seen = new Set();
    const uniqueEntries = entries.filter((entry) => {
      if (seen.has(entry.loc)) return false;
      seen.add(entry.loc);
      return true;
    }).map((entry) => sitemapUrlEntry(entry.loc, entry.lastmod, entry.changefreq, entry.priority));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueEntries.join("\n")}\n</urlset>\n`;
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(xml);
  } catch (error) {
    next(error);
  }
});

const clientBuildPath = path.resolve(__dirname, "..", "build");
const clientIndexPath = path.join(clientBuildPath, "index.html");
let clientIndexCache = "";

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `${replacement}\n</head>`);
}

function replaceTitle(html, title) {
  const safeTitle = escapeAttribute(title);
  return /<title>.*?<\/title>/i.test(html)
    ? html.replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`)
    : html.replace("</head>", `<title>${safeTitle}</title>\n</head>`);
}

function getCloudinaryOptimizedImageUrl(url, width = 1200) {
  const value = String(url || "").trim();
  if (!value) return "";
  const safeUrl = value.replace(/^http:\/\//i, "https://");
  if (/^https:\/\/res\.cloudinary\.com\//i.test(safeUrl) && safeUrl.includes("/image/upload/")) {
    if (/\/image\/upload\/[^/]*(?:f_auto|q_auto|w_\d+)/i.test(safeUrl)) return safeUrl;
    return safeUrl.replace("/image/upload/", `/image/upload/f_auto,q_auto:good,c_limit,w_${width}/`);
  }
  return safeUrl;
}

function heroPreloadTag(heroImageUrl = "") {
  const value = String(heroImageUrl || "").trim();
  if (!value) return "";
  if (/\/seed-assets\/hero-technician\.jpe?g$/i.test(value)) {
    return '<link rel="preload" as="image" href="/seed-assets/optimized/hero-technician-960.webp" type="image/webp" imagesrcset="/seed-assets/optimized/hero-technician-480.webp 480w, /seed-assets/optimized/hero-technician-720.webp 720w, /seed-assets/optimized/hero-technician-960.webp 960w, /seed-assets/optimized/hero-technician-1254.webp 1254w" imagesizes="(min-width: 1024px) 42vw, 92vw" fetchpriority="high" />';
  }
  const optimizedUrl = getCloudinaryOptimizedImageUrl(value, 1200);
  if (!optimizedUrl) return "";
  return `<link rel="preload" as="image" href="${escapeAttribute(optimizedUrl)}" fetchpriority="high" />`;
}

function injectWebSettings(html, site = {}, options = {}) {
  const webSettings = site.webSettings || {};
  const ogUrl = options.skipOgImage ? "" : webSettings.ogImage?.url;
  const faviconUrl = webSettings.favicon?.url;
  const appleUrl = webSettings.appleTouchIcon?.url;
  const heroPreload = heroPreloadTag(site.heroSlider?.[0]?.imageUrl || site.hero?.image?.url);
  let output = html;

  if (heroPreload) {
    output = replaceTag(output, /<link\s+rel="preload"\s+as="image"[^>]*fetchpriority="high"\s*\/?>/i, heroPreload);
  }

  if (ogUrl) {
    const safeOgUrl = escapeAttribute(ogUrl);
    output = replaceTag(output, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${safeOgUrl}" />`);
    output = replaceTag(output, /<meta property="og:image:secure_url" content="[^"]*"\s*\/?>/i, `<meta property="og:image:secure_url" content="${safeOgUrl}" />`);
    output = replaceTag(output, /<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${safeOgUrl}" />`);
    output = replaceTag(output, /<meta property="og:image:width" content="[^"]*"\s*\/?>/i, `<meta property="og:image:width" content="${webSettings.ogImage.width || 1200}" />`);
    output = replaceTag(output, /<meta property="og:image:height" content="[^"]*"\s*\/?>/i, `<meta property="og:image:height" content="${webSettings.ogImage.height || 630}" />`);
  }

  if (faviconUrl) {
    output = replaceTag(output, /<link\s+rel="icon"[^>]*>/i, `<link rel="icon" type="image/png" sizes="${webSettings.favicon.width || 32}x${webSettings.favicon.height || 32}" href="${escapeAttribute(faviconUrl)}" />`);
  }

  if (appleUrl) {
    output = replaceTag(output, /<link rel="apple-touch-icon" href="[^"]*"\s*\/?>/i, `<link rel="apple-touch-icon" sizes="${webSettings.appleTouchIcon.width || 180}x${webSettings.appleTouchIcon.height || 180}" href="${escapeAttribute(appleUrl)}" />`);
  }

  return output;
}

const ROUTE_SHARE_META = [
  {
    match: (pathname) => pathname === "/pulse-ai" || pathname === "/science-ai",
    title: "Pulse AI | Electronics Shop, Repair Guidance & Product Assistant",
    description: "Pulse AI by Prakash Electronics helps you find electronics shop products, wiring accessories, RGB lights, cooler repairing, AC repairing, home appliances repairing, and booking guidance in Chitarpur, Jharkhand.",
    ogImage: "/og-image-pulse-ai.jpg",
    ogImageAlt: "Pulse AI by Prakash Electronics",
    canonicalPath: "/pulse-ai",
  },
  {
    match: (pathname) => pathname === "/products" || pathname.startsWith("/products/"),
    title: "Electronics Shop Products in Chitarpur | Prakash Electronics",
    description: "Browse electronics shop products, wiring accessories, RGB lights, electrical parts, and accessories from Prakash Electronics and Electricals in Chitarpur.",
    ogImage: "/og-image-shop-products.jpg",
    ogImageAlt: "Prakash Electronics shop products",
    canonicalPath: "/products",
  },
  {
    match: (pathname) => (
      pathname === "/wiring-parts"
      || pathname === "/projects-parts"
      || pathname.startsWith("/wiring-parts/")
      || pathname.startsWith("/projects-parts/")
    ),
    title: "Wiring Accessories in Chitarpur | Prakash Electronics",
    description: "Buy wiring accessories, switches, sockets, wires, MCBs, and electrical fittings by category and brand from Prakash Electronics in Chitarpur.",
    ogImage: "/og-image-wiring.jpg",
    ogImageAlt: "Prakash Electronics wiring accessories",
    canonicalPath: "/wiring-parts",
  },
];

function getRouteShareMeta(pathname = "") {
  const clean = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  // Product detail pages keep product-specific OG images
  if (/^\/product-detail\//i.test(clean)) return null;
  return ROUTE_SHARE_META.find((item) => item.match(clean)) || null;
}

function injectRouteMetadata(html, routeMeta, origin) {
  if (!routeMeta) return html;

  const title = routeMeta.title;
  const description = routeMeta.description;
  const image = absoluteUrl(routeMeta.ogImage, origin);
  const url = absoluteUrl(routeMeta.canonicalPath || "/", origin);
  const imageAlt = routeMeta.ogImageAlt || title;

  let output = replaceTitle(html, title);
  output = replaceTag(output, /<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapeAttribute(url)}" />`);
  output = replaceTag(output, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeAttribute(description)}" />`);
  output = replaceTag(output, /<meta property="og:type" content="[^"]*"\s*\/?>/i, '<meta property="og:type" content="website" />');
  output = replaceTag(output, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeAttribute(title)}" />`);
  output = replaceTag(output, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeAttribute(description)}" />`);
  output = replaceTag(output, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${escapeAttribute(url)}" />`);
  output = replaceTag(output, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${escapeAttribute(image)}" />`);
  output = replaceTag(output, /<meta property="og:image:secure_url" content="[^"]*"\s*\/?>/i, `<meta property="og:image:secure_url" content="${escapeAttribute(image)}" />`);
  output = replaceTag(output, /<meta property="og:image:alt" content="[^"]*"\s*\/?>/i, `<meta property="og:image:alt" content="${escapeAttribute(imageAlt)}" />`);
  output = replaceTag(output, /<meta property="og:image:width" content="[^"]*"\s*\/?>/i, '<meta property="og:image:width" content="1200" />');
  output = replaceTag(output, /<meta property="og:image:height" content="[^"]*"\s*\/?>/i, '<meta property="og:image:height" content="630" />');
  output = replaceTag(output, /<meta name="twitter:card" content="[^"]*"\s*\/?>/i, '<meta name="twitter:card" content="summary_large_image" />');
  output = replaceTag(output, /<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeAttribute(title)}" />`);
  output = replaceTag(output, /<meta name="twitter:description" content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeAttribute(description)}" />`);
  output = replaceTag(output, /<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${escapeAttribute(image)}" />`);
  return output;
}

function injectProductMetadata(html, productMeta) {
  if (!productMeta) return html;

  const title = `${productMeta.title} | Prakash Electronics`;
  const description = productMeta.description;
  const image = productMeta.image;
  const url = productMeta.url;
  const imageAlt = productMeta.imageAlt || productMeta.title;
  const productJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: productMeta.title,
    description,
    image,
    url,
    brand: {
      "@type": "Brand",
      name: "Prakash Electronics",
    },
  }).replace(/</g, "\\u003c");

  let output = replaceTitle(html, title);
  output = replaceTag(output, /<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapeAttribute(url)}" />`);
  output = replaceTag(output, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeAttribute(description)}" />`);
  output = replaceTag(output, /<meta property="og:type" content="[^"]*"\s*\/?>/i, '<meta property="og:type" content="product" />');
  output = replaceTag(output, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeAttribute(title)}" />`);
  output = replaceTag(output, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeAttribute(description)}" />`);
  output = replaceTag(output, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${escapeAttribute(url)}" />`);
  output = replaceTag(output, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${escapeAttribute(image)}" />`);
  output = replaceTag(output, /<meta property="og:image:secure_url" content="[^"]*"\s*\/?>/i, `<meta property="og:image:secure_url" content="${escapeAttribute(image)}" />`);
  output = replaceTag(output, /<meta property="og:image:alt" content="[^"]*"\s*\/?>/i, `<meta property="og:image:alt" content="${escapeAttribute(imageAlt)}" />`);
  output = replaceTag(output, /<meta property="og:image:width" content="[^"]*"\s*\/?>/i, '<meta property="og:image:width" content="1200" />');
  output = replaceTag(output, /<meta property="og:image:height" content="[^"]*"\s*\/?>/i, '<meta property="og:image:height" content="630" />');
  output = replaceTag(output, /<meta name="twitter:card" content="[^"]*"\s*\/?>/i, '<meta name="twitter:card" content="summary_large_image" />');
  output = replaceTag(output, /<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeAttribute(title)}" />`);
  output = replaceTag(output, /<meta name="twitter:description" content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeAttribute(description)}" />`);
  output = replaceTag(output, /<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${escapeAttribute(image)}" />`);
  return replaceTag(
    output,
    /<script type="application\/ld\+json" data-product-share>[\s\S]*?<\/script>/i,
    `<script type="application/ld+json" data-product-share>${productJsonLd}</script>`,
  );
}

function productDetailIdentifier(reqPath = "") {
  const match = String(reqPath || "").match(/^\/product-detail\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}

function requestOrigin(req) {
  return `${req.protocol}://${req.get("host")}`;
}

app.use(express.static(clientBuildPath, {
  index: false,
  etag: true,
  maxAge: "7d",
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}static${path.sep}`)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return;
    }
    if (/\.(?:html)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache");
      return;
    }
    if (/\.(?:json)$/i.test(filePath)) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      return;
    }
    if (/\.(?:avif|webp|jpg|jpeg|png|ico|svg)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=2592000, stale-while-revalidate=604800");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=604800");
  },
}));
app.get("*", async (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  try {
    if (!clientIndexCache || env.nodeEnv !== "production") {
      clientIndexCache = await fs.readFile(clientIndexPath, "utf8");
    }
    const identifier = productDetailIdentifier(req.path);
    const origin = requestOrigin(req);
    const routeMeta = getRouteShareMeta(req.path);
    const [html, site, productMeta] = await Promise.all([
      Promise.resolve(clientIndexCache),
      getHtmlShellSiteMeta().catch(() => ({ webSettings: {} })),
      identifier ? findProductForMetadata(identifier, origin).catch((error) => {
        logger.warn("product.metadata_lookup_failed", { identifier, error: error.message });
        return null;
      }) : Promise.resolve(null),
    ]);
    res.set("Cache-Control", "no-cache");
    // Dedicated page OG images must win over the global admin OG setting.
    let htmlWithSettings = injectWebSettings(html, {
      ...site,
      webSettings: {
        ...(site.webSettings || {}),
        ogImage: site.webSettings?.ogImage?.url
          ? {
              ...site.webSettings.ogImage,
              url: absoluteUrl(site.webSettings.ogImage.url, origin),
            }
          : site.webSettings?.ogImage,
      },
    }, { skipOgImage: Boolean(routeMeta || productMeta) });

    htmlWithSettings = injectRouteMetadata(htmlWithSettings, routeMeta, origin);
    res.type("html").send(injectProductMetadata(htmlWithSettings, productMeta));
  } catch (_error) {
    next();
  }
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
