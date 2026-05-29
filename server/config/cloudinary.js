const { v2: cloudinary } = require("cloudinary");
const env = require("./env");
const { logger } = require("../utils/logger");

let configured = false;
let warnedMissing = false;

function configureCloudinary() {
  if (configured) return true;

  const missing = [];
  if (!env.cloudinary.cloudName) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!env.cloudinary.apiKey) missing.push("CLOUDINARY_API_KEY");
  if (!env.cloudinary.apiSecret) missing.push("CLOUDINARY_API_SECRET");

  if (missing.length) {
    if (!warnedMissing) {
      logger.warn("cloudinary.not_configured", { missing });
      warnedMissing = true;
    }
    return false;
  }

  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });

  configured = true;
  return true;
}

module.exports = { cloudinary, configureCloudinary };
