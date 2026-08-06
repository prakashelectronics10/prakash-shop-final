const express = require("express");
const {
  createInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  getInvoice,
  getNextInvoiceNumber,
  listInvoices,
  updateInvoice,
} = require("../controllers/invoiceController");
const { requirePermission } = require("../middleware/auth");
const { validateQuery } = require("../middleware/validate");
const { invoiceQuerySchema } = require("../validations/invoiceSchemas");

const router = express.Router();

router.use(requirePermission("invoices"));

router.get("/", validateQuery(invoiceQuerySchema), listInvoices);
router.get("/next-number", getNextInvoiceNumber);
router.post("/", createInvoice);
router.post("/create", createInvoice);
router.get("/:id", getInvoice);
router.get("/:id/pdf", downloadInvoicePdf);
router.put("/:id", updateInvoice);
router.patch("/:id", updateInvoice);
router.delete("/:id", deleteInvoice);

module.exports = router;
