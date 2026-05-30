const express = require("express");
const { publicInvoicePdf } = require("../controllers/invoiceController");

const router = express.Router();

router.get("/:token/pdf", publicInvoicePdf);

module.exports = router;
