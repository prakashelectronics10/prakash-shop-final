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
const { validateBody, validateQuery } = require("../middleware/validate");
const { invoiceSchema, invoiceUpdateSchema, invoiceQuerySchema } = require("../validations/invoiceSchemas");

const router = express.Router();

router.use(requirePermission("invoices"));

router.get("/", validateQuery(invoiceQuerySchema), listInvoices);
router.get("/next-number", getNextInvoiceNumber);
router.post("/", validateBody(invoiceSchema), createInvoice);
router.post("/create", validateBody(invoiceSchema), createInvoice);
router.get("/:id", getInvoice);
router.get("/:id/pdf", downloadInvoicePdf);
router.put("/:id", validateBody(invoiceUpdateSchema), updateInvoice);
router.patch("/:id", validateBody(invoiceUpdateSchema), updateInvoice);
router.delete("/:id", deleteInvoice);

module.exports = router;
