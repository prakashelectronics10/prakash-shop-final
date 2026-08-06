const express = require("express");
const {
  getBrandSliders,
  listBrandSliders,
  createBrandSlider,
  updateBrandSlider,
  deleteBrandSlider,
} = require("../controllers/brandSliderController");
const { requireAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.get("/public", getBrandSliders);

router.use("/admin", requireAdmin);
router.get("/admin", requirePermission("brandsSlider"), listBrandSliders);
router.post("/admin", requirePermission("brandsSlider"), createBrandSlider);
router.put("/admin/:id", requirePermission("brandsSlider"), updateBrandSlider);
router.delete("/admin/:id", requirePermission("brandsSlider"), deleteBrandSlider);

module.exports = router;
