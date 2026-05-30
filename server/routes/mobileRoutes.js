const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  grantAndroidAccess,
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
  message: { success: false, message: "Too many login attempts. Try again later." },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP attempts. Try again later." },
});

router.post("/auth/login", loginLimiter, login);
router.post("/auth/otp/verify", otpLimiter, verifyLoginOtp);
router.post("/auth/otp/resend", otpLimiter, resendLoginOtp);
router.post("/auth/request-access", loginLimiter, requestAndroidAccess);

router.use(requireAdmin);
router.get("/auth/me", me);
router.post("/auth/logout", logout);
router.post("/push-token", savePushToken);
router.post("/profile-image", upload.single("image"), updateProfileImage);

router.get("/notifications", listNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:id/read", markNotificationRead);
router.post("/notifications/:id/grant-access/request-otp", otpLimiter, requestGrantAccessOtp);
router.post("/notifications/:id/grant-access", otpLimiter, grantAndroidAccess);

module.exports = router;
