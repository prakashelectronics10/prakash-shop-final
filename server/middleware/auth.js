const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { clearAdminCookie } = require("../utils/cookie");
const {
  revokeSession,
  validateAdminSession,
} = require("../services/adminSessionService");

// Admin authentication is intentionally cookie-only. Every protected request
// verifies the JWT and the matching database session before any admin data is read.
const allPermissions = [
  "admins",
  "bookings",
  "offers",
  "services",
  "gallery",
  "testimonials",
  "featuredRepairs",
  "shopProducts",
  "projectParts",
  "projectSliders",
  "about",
  "footer",
  "webSettings",
  "notificationEmails",
  "invoices",
];

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const isSuperAdminEmail = (email) => normalizeEmail(email) === normalizeEmail(env.adminEmail);

function getRequestToken(req) {
  const authorization = String(req.headers.authorization || "");
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return {
      token: authorization.slice(7).trim(),
      source: "bearer",
    };
  }
  return {
    token: req.cookies?.[env.cookieName],
    source: "cookie",
  };
}

const requireAdmin = asyncHandler(async (req, res, next) => {
  const { token, source } = getRequestToken(req);

  if (!token) {
    throw new AppError("Admin login required", 401);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (_error) {
    if (source === "cookie") clearAdminCookie(res);
    throw new AppError("Session expired. Please login again.", 401);
  }

  let session;
  try {
    session = await validateAdminSession(payload);
  } catch (error) {
    if (source === "cookie") clearAdminCookie(res);
    throw error;
  }

  const admin = await Admin.findOne({ _id: payload.sub, isActive: true })
    .select("_id name email role tag permissions adminAndroidAppAccess lastMobileLogin mobileAccessRequestedAt isActive avatarUrl avatarPublicId");
  if (!admin) {
    await revokeSession(payload.sid, "admin-inactive");
    if (source === "cookie") clearAdminCookie(res);
    throw new AppError("Admin account is not active", 401);
  }

  admin._doc.isSuperAdmin = isSuperAdminEmail(admin.email);
  if (admin._doc.isSuperAdmin) {
    admin._doc.permissions = allPermissions;
  }

  req.admin = admin;
  req.adminSession = session;
  next();
});

const requireSuperAdmin = (req, _res, next) => {
  if (!isSuperAdminEmail(req.admin?.email)) {
    return next(new AppError("Only main owner can manage admins", 403));
  }
  return next();
};

const requirePermission = (...permissions) => (req, _res, next) => {
  if (isSuperAdminEmail(req.admin?.email)) return next();
  const granted = new Set(req.admin?.permissions || []);
  if (permissions.some((permission) => granted.has(permission))) return next();
  return next(new AppError("You do not have permission for this section", 403));
};

module.exports = { allPermissions, isSuperAdminEmail, requireAdmin, requireSuperAdmin, requirePermission };
