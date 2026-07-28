const express = require("express");
const {
  getShopProducts,
  getShopProductById,
  getShopProductCategories,
  getTrendingProducts,
  getTopProducts,
  trackProductView,
  listShopProducts,
  createShopProduct,
  updateShopProduct,
  deleteShopProduct,
} = require("../controllers/shopProductController");
const { upload, uploadImage } = require("../controllers/uploadController");
const { requireAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.get("/public/products", getShopProducts);
router.get("/public/categories", getShopProductCategories);
router.get("/public/trending", getTrendingProducts);
router.get("/public/top", getTopProducts);
router.post("/public/products/:id/view", trackProductView);
router.get("/public/products/:id", getShopProductById);

router.use("/admin", requireAdmin);
router.get("/admin/products", requirePermission("shopProducts"), listShopProducts);
router.post("/admin/products", requirePermission("shopProducts"), createShopProduct);
router.put("/admin/products/:id", requirePermission("shopProducts"), updateShopProduct);
router.delete("/admin/products/:id", requirePermission("shopProducts"), deleteShopProduct);
router.post("/admin/products/upload", requirePermission("shopProducts"), upload.single("image"), uploadImage);

module.exports = router;
