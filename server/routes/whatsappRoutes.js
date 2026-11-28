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
  customerBlockSchema,
} = require("../validations/whatsappSchemas");
const {
  listWhatsAppAccounts,
  createWhatsAppAccount,
  updateWhatsAppAccount,
  deleteWhatsAppAccount,
  importWhatsAppAccountFromEnv,
  getWhatsAppGreeting,
  upsertWhatsAppGreeting,
  publishWhatsAppAdWelcome,
  resolveWhatsAppOgImage,
  getWhatsAppAISettings,
  upsertWhatsAppAISettings,
  listWhatsAppConversations,
  getWhatsAppConversationMessages,
  updateWhatsAppConversationFlags,
  updateWhatsAppCustomerBlock,
  deleteWhatsAppCustomer,
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppDocument,
  uploadWhatsAppDocument,
  documentUploadMiddleware,
  streamWhatsAppEvents,
} = require("../controllers/whatsappAdminController");

const router = express.Router();
const { getVoiceSettings, updateVoiceSettings, listVoiceCalls, resolveVoiceCallback } = require("../controllers/whatsappVoiceAdminController");

router.use(requireAdmin, requirePermission("manageWhatsApp"));

router.get("/voice/settings", getVoiceSettings);
router.put("/voice/settings", updateVoiceSettings);
router.get("/voice/calls", listVoiceCalls);
router.patch("/voice/calls/:id/callback", resolveVoiceCallback);

router.get("/events", streamWhatsAppEvents);
router.get("/accounts", listWhatsAppAccounts);
router.post("/accounts", validateBody(whatsAppAccountSchema), createWhatsAppAccount);
router.post("/accounts/import-env", importWhatsAppAccountFromEnv);
router.put("/accounts/:id", validateBody(whatsAppAccountUpdateSchema), updateWhatsAppAccount);
router.delete("/accounts/:id", deleteWhatsAppAccount);

router.get("/greeting", getWhatsAppGreeting);
router.put("/greeting", validateBody(whatsAppGreetingSchema), upsertWhatsAppGreeting);
router.post("/greeting/ad-welcome", publishWhatsAppAdWelcome);
router.post("/og-image", validateBody(ogImageSchema), resolveWhatsAppOgImage);

router.get("/ai-settings", getWhatsAppAISettings);
router.put("/ai-settings", validateBody(whatsAppAISettingsSchema), upsertWhatsAppAISettings);

router.get("/conversations", listWhatsAppConversations);
router.get("/conversations/:id/messages", getWhatsAppConversationMessages);
router.patch("/conversations/:id", validateBody(conversationFlagsSchema), updateWhatsAppConversationFlags);
router.patch("/conversations/:id/block", validateBody(customerBlockSchema), updateWhatsAppCustomerBlock);
router.delete("/conversations/:id", deleteWhatsAppCustomer);
router.post("/conversations/send-text", validateBody(sendTextSchema), sendWhatsAppText);
router.post("/conversations/send-image", validateBody(sendMediaSchema), sendWhatsAppImage);
router.post("/conversations/send-document", validateBody(sendMediaSchema), sendWhatsAppDocument);
router.post("/conversations/upload-document", documentUploadMiddleware, uploadWhatsAppDocument);

module.exports = router;
