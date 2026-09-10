const express = require("express");
const {
  createPaymentOrder,
  getOrderQuote,
  verifyPayment,
  getPublicOrder,
  listOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const {
  getPublicCharges,
  listAdminCharges,
  createCharge,
  updateCharge,
  deleteCharge,
} = require("../controllers/additionalChargeController");

const router = express.Router();

router.post("/payment", createPaymentOrder);
router.post("/quote", getOrderQuote);
router.post("/payment/verify", verifyPayment);
router.get("/charges", getPublicCharges);
router.get("/track/:orderId", getPublicOrder);
router.get("/admin/charges", requireAdmin, requirePermission("orders"), listAdminCharges);
router.post("/admin/charges", requireAdmin, requirePermission("orders"), createCharge);
router.patch("/admin/charges/:id", requireAdmin, requirePermission("orders"), updateCharge);
router.delete("/admin/charges/:id", requireAdmin, requirePermission("orders"), deleteCharge);
router.get("/admin", requireAdmin, requirePermission("orders"), listOrders);
router.patch("/admin/:id/status", requireAdmin, requirePermission("orders"), updateOrderStatus);

module.exports = router;
