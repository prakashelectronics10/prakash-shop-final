const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const csv = (value, fallback = []) => {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
};

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: number(process.env.PORT, 5000),
  productionDomain: process.env.PRODUCTION_DOMAIN || "prakashshop.in",
  productionUrl: process.env.PRODUCTION_URL || "https://prakashshop.in",
  frontendUrl: process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PRODUCTION_URL || "https://prakashshop.in",
  mongoUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  cookieName: process.env.COOKIE_NAME || "prakash_admin_token",
  cookieMaxAgeMs: number(process.env.COOKIE_MAX_AGE_MS, 24 * 60 * 60 * 1000),
  cookieSameSite: process.env.COOKIE_SAME_SITE || "lax",
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  adminSessionBindIp: bool(process.env.ADMIN_SESSION_BIND_IP, false),
  otpExpiresMs: number(process.env.OTP_EXPIRES_MS, 5 * 60 * 1000),
  otpResendCooldownMs: number(process.env.OTP_RESEND_COOLDOWN_MS, 45 * 1000),
  otpMaxAttempts: number(process.env.OTP_MAX_ATTEMPTS, 5),
  otpMaxResends: number(process.env.OTP_MAX_RESENDS, 4),
  mail: {
    fromName: process.env.MAIL_FROM_NAME || "Prakash Electronics",
    replyTo: process.env.MAIL_REPLY_TO || process.env.MAIL_SUPPORT_EMAIL || "",
    supportEmail: process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_REPLY_TO || "",
    supportPhone: process.env.MAIL_SUPPORT_PHONE || "",
    websiteUrl: process.env.MAIL_WEBSITE_URL || process.env.PRODUCTION_URL || "https://prakashshop.in",
  },
  brevo: {
    apiKey: process.env.BREVO_API_KEY || "",
    from: process.env.BREVO_FROM_EMAIL || process.env.BREVO_SENDER_EMAIL || "",
    fromName: process.env.BREVO_FROM_NAME || process.env.BREVO_SENDER_NAME || process.env.MAIL_FROM_NAME || "Prakash Electronics",
    apiUrl: process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email",
    enabled: bool(process.env.BREVO_ENABLED, true),
  },
  corsOrigins: csv(process.env.CORS_ORIGINS, [
    "https://prakashshop.in",
    "https://www.prakashshop.in",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]),
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_FOLDER || "prakash-electronics",
  },
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
};

module.exports = env;
