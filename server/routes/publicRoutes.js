const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getSite,
  getProducts,
  getProductBySlug,
  trackFormSubmit,
  validateBookingEmail,
  validateBookingAddress,
  suggestBookingAddresses,
  createBooking,
  createContactMessage,
} = require("../controllers/publicController");
const {
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
} = require("../controllers/customerWhatsAppOtpController");
const { upload } = require("../controllers/uploadController");

const router = express.Router();
const whatsappOtpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many WhatsApp code requests. Please try again later." },
});
const whatsappOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many verification attempts. Please try again later." },
});

router.get("/site", getSite);
router.get("/products", getProducts);
router.get("/products/:slug", getProductBySlug);
router.post("/contact", createContactMessage);
router.post("/validate-email", validateBookingEmail);
router.post("/validate-address", validateBookingAddress);
router.post("/suggest-addresses", suggestBookingAddresses);
router.post("/whatsapp-otp/send", whatsappOtpSendLimiter, sendWhatsAppOtp);
router.post("/whatsapp-otp/verify", whatsappOtpVerifyLimiter, verifyWhatsAppOtp);
router.post("/bookings", upload.array("images", 8), createBooking);

const analyticsRouter = express.Router();
analyticsRouter.post("/form-submit", trackFormSubmit);

module.exports = { publicRouter: router, analyticsRouter };
