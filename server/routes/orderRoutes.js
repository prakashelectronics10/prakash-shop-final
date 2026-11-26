const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  createPaymentOrder,
  getOrderQuote,
  verifyPayment,
  markPaymentFailed,
  getPublicOrder,
  listOrders,
  updateOrderStatus,
  downloadPublicOrderInvoice,
  getCheckoutPaymentStatus,
  getCustomerOrders,
  retryCustomerOrderPayment,
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
const customerOrderLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

router.post("/payment", createPaymentOrder);
router.post("/quote", getOrderQuote);
router.post("/payment/verify", customerOrderLimiter, verifyPayment);
router.post("/payment/failed", customerOrderLimiter, markPaymentFailed);
router.post("/payment/status", customerOrderLimiter, getCheckoutPaymentStatus);
router.post("/history", customerOrderLimiter, getCustomerOrders);
router.post("/history/:orderId/pay", customerOrderLimiter, retryCustomerOrderPayment);
router.get("/track/:orderId/invoice.pdf", downloadPublicOrderInvoice);
router.get("/charges", getPublicCharges);
router.get("/track/:orderId", getPublicOrder);
router.get("/admin/charges", requireAdmin, requirePermission("orders"), listAdminCharges);
router.post("/admin/charges", requireAdmin, requirePermission("orders"), createCharge);
router.patch("/admin/charges/:id", requireAdmin, requirePermission("orders"), updateCharge);
router.delete("/admin/charges/:id", requireAdmin, requirePermission("orders"), deleteCharge);
router.get("/admin", requireAdmin, requirePermission("orders"), listOrders);
router.patch("/admin/:id/status", requireAdmin, requirePermission("orders"), updateOrderStatus);

module.exports = router;
