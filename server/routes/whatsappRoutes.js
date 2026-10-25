const express = require("express");
const { requireAdmin, requirePermission } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const {
  whatsAppAccountSchema,
  whatsAppAccountUpdateSchema,
  whatsAppGreetingSchema,
  whatsAppAISettingsSchema,
  ogImageSchema,
  sendTextSchema,
  sendMediaSchema,
  conversationFlagsSchema,
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
  getWhatsAppAISettings,
  upsertWhatsAppAISettings,
  listWhatsAppConversations,
  getWhatsAppConversationMessages,
  updateWhatsAppConversationFlags,
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppDocument,
  uploadWhatsAppDocument,
  documentUploadMiddleware,
  streamWhatsAppEvents,
} = require("../controllers/whatsappAdminController");

const router = express.Router();

router.use(requireAdmin, requirePermission("manageWhatsApp"));

router.get("/events", streamWhatsAppEvents);
router.get("/accounts", listWhatsAppAccounts);
router.post("/accounts", validateBody(whatsAppAccountSchema), createWhatsAppAccount);
router.post("/accounts/import-env", importWhatsAppAccountFromEnv);
router.put("/accounts/:id", validateBody(whatsAppAccountUpdateSchema), updateWhatsAppAccount);
router.delete("/accounts/:id", deleteWhatsAppAccount);

router.get("/greeting", getWhatsAppGreeting);
router.put("/greeting", validateBody(whatsAppGreetingSchema), upsertWhatsAppGreeting);
router.post("/og-image", validateBody(ogImageSchema), resolveWhatsAppOgImage);

router.get("/ai-settings", getWhatsAppAISettings);
router.put("/ai-settings", validateBody(whatsAppAISettingsSchema), upsertWhatsAppAISettings);

router.get("/conversations", listWhatsAppConversations);
router.get("/conversations/:id/messages", getWhatsAppConversationMessages);
router.patch("/conversations/:id", validateBody(conversationFlagsSchema), updateWhatsAppConversationFlags);
router.post("/conversations/send-text", validateBody(sendTextSchema), sendWhatsAppText);
router.post("/conversations/send-image", validateBody(sendMediaSchema), sendWhatsAppImage);
router.post("/conversations/send-document", validateBody(sendMediaSchema), sendWhatsAppDocument);
router.post("/conversations/upload-document", documentUploadMiddleware, uploadWhatsAppDocument);

module.exports = router;
