const express = require("express");
const rateLimit = require("express-rate-limit");
const AppError = require("../utils/AppError");
const {
  grantAndroidAccess,
  confirmPassword,
  listNotifications,
  login,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
  me,
  requestAndroidAccess,
  requestGrantAccessOtp,
  resendLoginOtp,
  savePushToken,
  updateProfileImage,
  verifyLoginOtp,
} = require("../controllers/mobileController");
const { upload } = require("../controllers/uploadController");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later.", data: null, error: "RATE_LIMITED" },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP attempts. Try again later.", data: null, error: "RATE_LIMITED" },
});

function sendOtp(req, res, next) {
  if (req.body?.challengeId) return resendLoginOtp(req, res, next);
  return login(req, res, next);
}

function copyNotificationId(req, _res, next) {
  const id = String(req.body?.notificationId || req.params?.id || "").trim();
  if (!id) return next(new AppError("Notification id is required", 400));
  req.params.id = id;
  return next();
}

function grantAccess(req, res, next) {
  if (req.body?.challengeId && req.body?.otp) {
    return grantAndroidAccess(req, res, next);
  }
  return requestGrantAccessOtp(req, res, next);
}

router.post("/login", loginLimiter, login);
router.post("/send-otp", loginLimiter, sendOtp);
router.post("/verify-otp", otpLimiter, verifyLoginOtp);
router.post("/request-access", loginLimiter, requestAndroidAccess);

router.use(requireAdmin);
router.get("/me", me);
router.post("/confirm-password", confirmPassword);
router.post("/logout", logout);
router.post("/save-push-token", savePushToken);
router.post("/profile-image", upload.single("image"), updateProfileImage);
router.post("/grant-access", otpLimiter, copyNotificationId, grantAccess);

router.get("/notifications", listNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:id/read", markNotificationRead);

module.exports = router;
