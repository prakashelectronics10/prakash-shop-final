const express = require("express");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const {
  whatsAppAccountSchema,
  whatsAppAccountUpdateSchema,
  whatsAppGreetingSchema,
  ogImageSchema,
} = require("../validations/whatsappSchemas");
const {
  listWhatsAppAccounts,
  createWhatsAppAccount,
  updateWhatsAppAccount,
  deleteWhatsAppAccount,
  importWhatsAppAccountFromEnv,
  getWhatsAppGreeting,
  upsertWhatsAppGreeting,
  resolveWhatsAppOgImage,
} = require("../controllers/whatsappAdminController");

const router = express.Router();

router.use(requireAdmin, requirePermission("manageWhatsApp"));
router.get("/accounts", listWhatsAppAccounts);
router.post("/accounts", validateBody(whatsAppAccountSchema), createWhatsAppAccount);
router.post("/accounts/import-env", importWhatsAppAccountFromEnv);
router.put("/accounts/:id", validateBody(whatsAppAccountUpdateSchema), updateWhatsAppAccount);
router.delete("/accounts/:id", deleteWhatsAppAccount);
router.get("/greeting", getWhatsAppGreeting);
router.put("/greeting", validateBody(whatsAppGreetingSchema), upsertWhatsAppGreeting);
router.post("/og-image", validateBody(ogImageSchema), resolveWhatsAppOgImage);

module.exports = router;
