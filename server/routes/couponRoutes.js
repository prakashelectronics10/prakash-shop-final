const express = require("express");
const {
  getPublicProductCoupons,
  validateProductCoupon,
} = require("../controllers/couponController");

const router = express.Router();

router.get("/product/:productId", getPublicProductCoupons);
router.post("/validate", validateProductCoupon);

module.exports = router;
