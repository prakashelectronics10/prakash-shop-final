const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { setAdminCookie, clearAdminCookie } = require("../utils/cookie");
const { allPermissions, isSuperAdminEmail } = require("../middleware/auth");
const {
  assertNoOtherDeviceSession,
  createAdminSession,
  revokeSession,
} = require("../services/adminSessionService");
const {
  createOtpChallenge,
  maskEmail,
  resendOtpChallenge,
  verifyOtpChallenge,
} = require("../services/adminOtpService");

function publicAdmin(admin) {
  const isSuperAdmin = isSuperAdminEmail(admin.email);
  return {
    id: admin._id,
    name: admin.name || "",
    email: admin.email,
    role: admin.role,
    tag: isSuperAdmin ? "main owner" : admin.tag || "admin",
    permissions: isSuperAdmin ? allPermissions : admin.permissions || [],
    adminAndroidAppAccess: isSuperAdmin ? true : Boolean(admin.adminAndroidAppAccess),
    lastMobileLogin: admin.lastMobileLogin || null,
    mobileAccessRequestedAt: admin.mobileAccessRequestedAt || null,
    isSuperAdmin,
  };
}

function signToken(admin, session, jwtId) {
  return jwt.sign({
    sub: admin._id.toString(),
    sid: session._id.toString(),
    jti: jwtId,
    role: admin.role,
  }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function ensureJwtSecret() {
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw new AppError("JWT_SECRET must be configured with a long random value", 500);
  }
}

const login = asyncHandler(async (req, res) => {
  ensureJwtSecret();

  const admin = await Admin.findOne({ email: req.body.email, isActive: true }).select("+passwordHash");
  if (!admin) {
    throw new AppError("Invalid email or password", 401);
  }

  const matches = await admin.comparePassword(req.body.password);
  if (!matches) {
    throw new AppError("Invalid email or password", 401);
  }

  await assertNoOtherDeviceSession(admin._id, req);
  const challenge = await createOtpChallenge({
    admin,
    purpose: "login",
    req,
  });

  res.json({
    success: true,
    requiresOtp: true,
    challengeId: challenge._id,
    expiresAt: challenge.expiresAt,
    email: maskEmail(admin.email),
    message: "OTP sent to verified admin email",
  });
});

const verifyLoginOtp = asyncHandler(async (req, res) => {
  ensureJwtSecret();
  const challenge = await verifyOtpChallenge({
    challengeId: req.body.challengeId,
    otp: req.body.otp,
    adminId: undefined,
    purpose: "login",
  });

  const admin = await Admin.findOne({ _id: challenge.admin, isActive: true });
  if (!admin) {
    throw new AppError("Admin account is not active", 401);
  }

  const { session, jwtId } = await createAdminSession(admin, req);

  admin.lastLoginAt = new Date();
  await admin.save();

  setAdminCookie(res, signToken(admin, session, jwtId));

  res.json({
    success: true,
    admin: publicAdmin(admin),
  });
});

const resendLoginOtp = asyncHandler(async (req, res) => {
  const challenge = await resendOtpChallenge({
    challengeId: req.body.challengeId,
    purpose: "login",
    adminId: undefined,
  });

  res.json({
    success: true,
    challengeId: challenge._id,
    expiresAt: challenge.expiresAt,
    email: maskEmail(challenge.email),
    message: "OTP resent to verified admin email",
  });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.cookieName];
  if (token) {
    const payload = jwt.decode(token);
    if (payload?.sid) {
      await revokeSession(payload.sid, "logout");
    }
  }
  clearAdminCookie(res);
  res.json({ success: true });
});

const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    admin: publicAdmin(req.admin),
  });
});

module.exports = {
  ensureJwtSecret,
  login,
  me,
  publicAdmin,
  resendLoginOtp,
  signToken,
  logout,
  verifyLoginOtp,
};
