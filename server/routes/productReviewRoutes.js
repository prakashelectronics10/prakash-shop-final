const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const reviews = require("../controllers/productReviewController");
const whatsapp = require("../controllers/reviewWhatsAppController");

const router = express.Router();
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many review attempts. Please try again later." },
});
const whatsappOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false,
  message: { success: false, message: "Too many WhatsApp code requests. Please try again later." },
});

router.get("/public/:sourceType/:productId", reviews.getPublicReviews);
router.post("/public/:sourceType/:productId/verify", reviewLimiter, reviews.verifyReviewOrder);
router.post("/public/:sourceType/:productId", reviewLimiter, reviews.submitReview);

router.use("/admin", requireAdmin, requirePermission("productReviews"));
router.get("/admin", reviews.listAdminReviews);
router.get("/admin/products", reviews.listReviewProducts);
router.get("/admin/whatsapp", whatsapp.getSettings);
router.patch("/admin/whatsapp", whatsapp.setEnabled);
router.post("/admin/whatsapp/otp", whatsappOtpLimiter, whatsapp.sendOtp);
router.post("/admin/whatsapp/recipients", whatsapp.addRecipient);
router.delete("/admin/whatsapp/recipients/:id", whatsapp.removeRecipient);
router.patch("/admin/:id", reviews.updateReview);

module.exports = router;
