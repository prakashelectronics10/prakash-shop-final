const express = require("express");
const rateLimit = require("express-rate-limit");
const { login, verifyLoginOtp, resendLoginOtp, logout, me } = require("../controllers/authController");
const { requireAdmin } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { loginSchema, otpVerifySchema, otpResendSchema } = require("../validations/adminSchemas");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later." },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP attempts. Try again later." },
});

const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP resend requests. Try again later." },
});

// There is deliberately no signup/register route.
router.post("/login", loginLimiter, validateBody(loginSchema), login);
router.post("/otp/verify", otpVerifyLimiter, validateBody(otpVerifySchema), verifyLoginOtp);
router.post("/otp/resend", otpResendLimiter, validateBody(otpResendSchema), resendLoginOtp);
router.post("/logout", logout);
router.get("/me", requireAdmin, me);

module.exports = router;
