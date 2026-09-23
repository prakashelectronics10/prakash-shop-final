const env = require("./env");
const { logger } = require("../utils/logger");

function missingWhen(condition, key) {
  return condition ? [key] : [];
}

function validateRuntimeConfig() {
  const missing = [
    ...missingWhen(!env.mongoUri, "MONGODB_URI"),
    ...missingWhen(!env.jwtSecret || env.jwtSecret.length < 32, "JWT_SECRET"),
    ...missingWhen(!env.brevo.apiKey, "BREVO_API_KEY"),
    ...missingWhen(!env.brevo.from, "BREVO_FROM_EMAIL"),
    ...missingWhen(!env.cloudinary.cloudName, "CLOUDINARY_CLOUD_NAME"),
    ...missingWhen(!env.cloudinary.apiKey, "CLOUDINARY_API_KEY"),
    ...missingWhen(!env.cloudinary.apiSecret, "CLOUDINARY_API_SECRET"),
    ...missingWhen(!env.razorpay.keyId, "RAZORPAY_KEY_ID"),
    ...missingWhen(!env.razorpay.keySecret, "RAZORPAY_KEY_SECRET"),
    ...missingWhen(!env.razorpay.webhookSecret, "RAZORPAY_WEBHOOK_SECRET"),
  ];

  if (env.nodeEnv === "production") {
    if (!env.corsOrigins.includes("https://prakashshop.in")) missing.push("CORS_ORIGINS:https://prakashshop.in");
    if (!env.corsOrigins.includes("https://www.prakashshop.in")) missing.push("CORS_ORIGINS:https://www.prakashshop.in");
    if (!env.cookieSecure) missing.push("COOKIE_SECURE=true");
  }

  if (missing.length) {
    logger.warn("runtime_config.missing_or_weak", { missing });
  } else {
    logger.info("runtime_config.ready", {
      productionDomain: env.productionDomain,
      emailProvider: "brevo",
      cloudinaryFolder: env.cloudinary.folder,
    });
  }

  const metaConfigured = Boolean(
    env.metaCatalog.catalogId
    && env.metaCatalog.accessToken
    && /^v\d+\.\d+$/.test(env.metaCatalog.graphApiVersion),
  );
  logger.info("meta_catalog.runtime_config", {
    configured: metaConfigured,
    graphApiVersion: env.metaCatalog.graphApiVersion,
    catalogIdConfigured: Boolean(env.metaCatalog.catalogId),
  });

  return { missing, metaConfigured };
}

module.exports = { validateRuntimeConfig };
