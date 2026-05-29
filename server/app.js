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
const { updateProfileImage } = require("./controllers/mobileController");
const { upload } = require("./controllers/uploadController");
const { getSitePayload } = require("./services/siteService");
const { isEmailConfigured } = require("./services/mailService");
const { configureCloudinary } = require("./config/cloudinary");

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
app.use("/api/mobile-auth", mobileAuthRoutes);
app.use("/api/mobile", mobileRoutes);
app.use("/api/discussion", requireAdmin, discussionRoutes);
app.use("/api/files", requireAdmin, fileRoutes);
app.use("/api/invoices/public", invoicePublicRoutes);
app.use("/api/invoices", requireAdmin, invoiceRoutes);
app.use("/api/admin", requireAdmin, adminRoutes);
app.use("/api/project-parts", projectPartRoutes);
app.use("/api/shop-products", shopProductRoutes);
app.use("/api/science-ai", scienceAIRoutes);

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

function injectWebSettings(html, site = {}) {
  const webSettings = site.webSettings || {};
  const ogUrl = webSettings.ogImage?.url;
  const faviconUrl = webSettings.favicon?.url;
  const appleUrl = webSettings.appleTouchIcon?.url;
  const heroPreload = heroPreloadTag(site.hero?.image?.url);
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
    const [html, site] = await Promise.all([
      Promise.resolve(clientIndexCache),
      getSitePayload(),
    ]);
    res.set("Cache-Control", "no-cache");
    res.type("html").send(injectWebSettings(html, site));
  } catch (_error) {
    next();
  }
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
