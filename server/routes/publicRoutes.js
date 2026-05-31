const express = require("express");
const {
  getSite,
  getProducts,
  getProductBySlug,
  trackFormSubmit,
  validateBookingEmail,
  createBooking,
  createContactMessage,
} = require("../controllers/publicController");
const { upload } = require("../controllers/uploadController");

const router = express.Router();

router.get("/site", getSite);
router.get("/products", getProducts);
router.get("/products/:slug", getProductBySlug);
router.post("/contact", createContactMessage);
router.post("/validate-email", validateBookingEmail);
router.post("/bookings", upload.array("images", 8), createBooking);

const analyticsRouter = express.Router();
analyticsRouter.post("/form-submit", trackFormSubmit);

module.exports = { publicRouter: router, analyticsRouter };
