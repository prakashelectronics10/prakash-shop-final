const mongoose = require("mongoose");
const catchAsync = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const WhatsAppGreeting = require("../models/WhatsAppGreeting");
const WhatsAppConversation = require("../models/WhatsAppConversation");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const WhatsAppAISettings = require("../models/WhatsAppAISettings");
const { resolveOgImage } = require("../services/ogImageService");
const {
  sanitizeButtons,
  sanitizeGreetingMessage,
  normalizeGreetingMessages,
  syncConversationalAutomation,
} = require("../services/whatsappGreetingService");
const {
  recordMessage,
  markConversationRead,
  serializeConversation,
  serializeMessage,
} = require("../services/whatsappConversationService");
const { getOrCreateAISettings } = require("../services/whatsappAIService");
const {
  sendTextMessage,
  sendImageMessage,
  sendDocumentMessage,
} = require("../services/whatsappCloudApiService");
const { collectPublicIdsFromSources, deleteImagesStrict, uploadBuffer } = require("../services/cloudinaryService");
const { addClient } = require("../services/whatsappRealtimeService");
const env = require("../config/env");
const multer = require("multer");

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ]);
    if (!allowed.has(file.mimetype)) {
      return cb(new AppError("Upload PDF, DOC, DOCX, or TXT files only", 400));
    }
    return cb(null, true);
  },
});

exports.documentUploadMiddleware = documentUpload.single("document");

function maskToken(token) {
  const value = String(token || "");
  if (value.length < 12) return value ? "••••" : "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function serializeAccount(account) {
  const doc = account.toObject ? account.toObject() : { ...account };
  return {
    id: String(doc._id),
    _id: String(doc._id),
    label: doc.label,
    phoneNumberId: doc.phoneNumberId,
    businessAccountId: doc.businessAccountId,
    displayPhoneNumber: doc.displayPhoneNumber || "",
    isActive: doc.isActive !== false,
    notes: doc.notes || "",
    accessTokenMasked: maskToken(doc.accessToken),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeGreeting(greeting) {
  if (!greeting) return null;
  const doc = greeting.toObject ? greeting.toObject() : { ...greeting };
  const messages = normalizeGreetingMessages(doc);
  return {
    id: String(doc._id),
    _id: String(doc._id),
    accountId: String(doc.account),
    enabled: doc.enabled !== false,
    enableWelcomeMessage: doc.enableWelcomeMessage !== false,
    iceBreakers: Array.isArray(doc.iceBreakers) ? doc.iceBreakers : [],
    messages,
    updatedAt: doc.updatedAt,
  };
}

function serializeAISettings(settings) {
  const doc = settings.toObject ? settings.toObject() : { ...settings };
  return {
    id: String(doc._id),
    accountId: String(doc.account),
    enabled: doc.enabled !== false,
    systemPromptExtra: doc.systemPromptExtra || "",
    sendProductImages: doc.sendProductImages !== false,
    sendOfferImages: doc.sendOfferImages !== false,
    maxImagesPerReply: Number(doc.maxImagesPerReply ?? 3),
    allowButtons: doc.allowButtons !== false,
    pauseOnHumanReply: doc.pauseOnHumanReply !== false,
    updatedAt: doc.updatedAt,
  };
}

async function collectGreetingPublicIds(greeting) {
  const ids = [];
  if (greeting?.imagePublicId) ids.push(greeting.imagePublicId);
  for (const message of greeting?.messages || []) {
    if (message.imagePublicId) ids.push(message.imagePublicId);
    if (Array.isArray(message.imagePublicIds)) ids.push(...message.imagePublicIds);
  }
  return collectPublicIdsFromSources(ids);
}

exports.listWhatsAppAccounts = catchAsync(async (_req, res) => {
  const accounts = await WhatsAppAccount.find().sort({ createdAt: -1 });
  res.json({
    success: true,
    data: {
      accounts: accounts.map((account) => serializeAccount(account)),
      envDefaults: {
        hasPhoneNumberId: Boolean(env.whatsapp.phoneNumberId),
        hasAccessToken: Boolean(env.whatsapp.accessToken),
        hasBusinessAccountId: Boolean(env.whatsapp.businessAccountId),
        webhookVerifyConfigured: Boolean(env.whatsapp.webhookVerifyToken),
        enabled: Boolean(env.whatsapp.enabled),
        callbackPath: "/api/whatsapp/webhook",
      },
    },
  });
});

exports.createWhatsAppAccount = catchAsync(async (req, res) => {
  const payload = req.body;
  const existing = await WhatsAppAccount.findOne({ phoneNumberId: payload.phoneNumberId });
  if (existing) throw new AppError("An account with this Phone Number ID already exists", 409);

  const account = await WhatsAppAccount.create({
    label: payload.label,
    phoneNumberId: payload.phoneNumberId,
    businessAccountId: payload.businessAccountId,
    displayPhoneNumber: payload.displayPhoneNumber || "",
    accessToken: payload.accessToken,
    isActive: payload.isActive !== false,
    notes: payload.notes || "",
  });

  res.status(201).json({ success: true, data: serializeAccount(account) });
});

exports.updateWhatsAppAccount = catchAsync(async (req, res) => {
  const account = await WhatsAppAccount.findById(req.params.id);
  if (!account) throw new AppError("WhatsApp account not found", 404);

  const payload = req.body;
  if (payload.phoneNumberId && payload.phoneNumberId !== account.phoneNumberId) {
    const clash = await WhatsAppAccount.findOne({
      phoneNumberId: payload.phoneNumberId,
      _id: { $ne: account._id },
    });
    if (clash) throw new AppError("Another account already uses this Phone Number ID", 409);
    account.phoneNumberId = payload.phoneNumberId;
  }

  account.label = payload.label;
  account.businessAccountId = payload.businessAccountId;
  account.displayPhoneNumber = payload.displayPhoneNumber || "";
  account.isActive = payload.isActive !== false;
  account.notes = payload.notes || "";
  if (payload.accessToken) account.accessToken = payload.accessToken;
  await account.save();

  res.json({ success: true, data: serializeAccount(account) });
});

exports.deleteWhatsAppAccount = catchAsync(async (req, res) => {
  const account = await WhatsAppAccount.findById(req.params.id);
  if (!account) throw new AppError("WhatsApp account not found", 404);

  const greeting = await WhatsAppGreeting.findOne({ account: account._id });
  const publicIds = await collectGreetingPublicIds(greeting);
  if (publicIds.length) await deleteImagesStrict(publicIds);

  await WhatsAppGreeting.deleteOne({ account: account._id });
  await WhatsAppAISettings.deleteOne({ account: account._id });
  await WhatsAppMessage.deleteMany({ account: account._id });
  await WhatsAppConversation.deleteMany({ account: account._id });
  await account.deleteOne();

  res.json({ success: true, data: { id: String(account._id) } });
});

exports.importWhatsAppAccountFromEnv = catchAsync(async (_req, res) => {
  if (!env.whatsapp.phoneNumberId || !env.whatsapp.accessToken || !env.whatsapp.businessAccountId) {
    throw new AppError("Fill WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, and WHATSAPP_ACCESS_TOKEN in .env first", 400);
  }

  const existing = await WhatsAppAccount.findOne({ phoneNumberId: env.whatsapp.phoneNumberId });
  if (existing) {
    return res.json({ success: true, data: serializeAccount(existing), imported: false });
  }

  const account = await WhatsAppAccount.create({
    label: "Primary (from .env)",
    phoneNumberId: env.whatsapp.phoneNumberId,
    businessAccountId: env.whatsapp.businessAccountId,
    accessToken: env.whatsapp.accessToken,
    isActive: true,
    notes: "Imported from server environment variables",
  });

  res.status(201).json({ success: true, data: serializeAccount(account), imported: true });
});

exports.getWhatsAppGreeting = catchAsync(async (req, res) => {
  const accountId = req.query.accountId || req.params.accountId;
  if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
    throw new AppError("Valid accountId is required", 400);
  }
  const account = await WhatsAppAccount.findById(accountId).select("_id");
  if (!account) throw new AppError("WhatsApp account not found", 404);
  const greeting = await WhatsAppGreeting.findOne({ account: accountId });
  res.json({ success: true, data: serializeGreeting(greeting) });
});

exports.upsertWhatsAppGreeting = catchAsync(async (req, res) => {
  const payload = req.body;
  if (!mongoose.Types.ObjectId.isValid(payload.accountId)) {
    throw new AppError("Valid accountId is required", 400);
  }

  const account = await WhatsAppAccount.findById(payload.accountId);
  if (!account) throw new AppError("WhatsApp account not found", 404);

  const existing = await WhatsAppGreeting.findOne({ account: account._id });
  const nextMessages = (payload.messages || []).map((item, index) => sanitizeGreetingMessage(item, index));
  const nextPublicIds = await collectGreetingPublicIds({ messages: nextMessages });
  const oldPublicIds = await collectGreetingPublicIds(existing);
  const removed = oldPublicIds.filter((id) => !nextPublicIds.includes(id));
  if (removed.length) await deleteImagesStrict(removed);

  const first = nextMessages[0] || {};
  const greeting = await WhatsAppGreeting.findOneAndUpdate(
    { account: account._id },
    {
      $set: {
        enabled: payload.enabled !== false,
        enableWelcomeMessage: payload.enableWelcomeMessage !== false,
        iceBreakers: (payload.iceBreakers || []).map((item) => String(item).trim().slice(0, 80)).filter(Boolean).slice(0, 4),
        messages: nextMessages,
        bodyText: first.bodyText || "",
        footerText: first.footerText || "",
        imageUrl: first.imageUrl || "",
        imagePublicId: first.imagePublicId || "",
        imageSourceUrl: first.imageSourceUrl || "",
        buttons: sanitizeButtons(first.buttons || []),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  let automationWarning = "";
  try {
    await syncConversationalAutomation(account, greeting);
  } catch (error) {
    automationWarning = error.message || "Could not sync Meta welcome/ice breakers";
  }

  res.json({
    success: true,
    data: serializeGreeting(greeting),
    warning: automationWarning || undefined,
  });
});

exports.resolveWhatsAppOgImage = catchAsync(async (req, res) => {
  const result = await resolveOgImage(req.body.url);
  res.json({ success: true, data: result });
});

exports.getWhatsAppAISettings = catchAsync(async (req, res) => {
  const accountId = req.query.accountId;
  if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
    throw new AppError("Valid accountId is required", 400);
  }
  const account = await WhatsAppAccount.findById(accountId).select("_id");
  if (!account) throw new AppError("WhatsApp account not found", 404);
  const settings = await getOrCreateAISettings(accountId);
  res.json({ success: true, data: serializeAISettings(settings) });
});

exports.upsertWhatsAppAISettings = catchAsync(async (req, res) => {
  const payload = req.body;
  if (!mongoose.Types.ObjectId.isValid(payload.accountId)) {
    throw new AppError("Valid accountId is required", 400);
  }
  const account = await WhatsAppAccount.findById(payload.accountId).select("_id");
  if (!account) throw new AppError("WhatsApp account not found", 404);

  const settings = await WhatsAppAISettings.findOneAndUpdate(
    { account: payload.accountId },
    {
      $set: {
        enabled: payload.enabled !== false,
        systemPromptExtra: payload.systemPromptExtra || "",
        sendProductImages: payload.sendProductImages !== false,
        sendOfferImages: payload.sendOfferImages !== false,
        maxImagesPerReply: Number(payload.maxImagesPerReply ?? 3),
        allowButtons: payload.allowButtons !== false,
        pauseOnHumanReply: payload.pauseOnHumanReply !== false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({ success: true, data: serializeAISettings(settings) });
});

exports.listWhatsAppConversations = catchAsync(async (req, res) => {
  const accountId = req.query.accountId;
  if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
    throw new AppError("Valid accountId is required", 400);
  }
  const search = String(req.query.search || "").trim();
  const filter = { account: accountId };
  if (search) {
    filter.$or = [
      { customerName: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      { customerWaId: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      { lastMessagePreview: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
    ];
  }
  const conversations = await WhatsAppConversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(100);
  res.json({ success: true, data: conversations.map(serializeConversation) });
});

exports.getWhatsAppConversationMessages = catchAsync(async (req, res) => {
  const conversation = await WhatsAppConversation.findById(req.params.id);
  if (!conversation) throw new AppError("Conversation not found", 404);

  await markConversationRead(conversation._id);
  const messages = await WhatsAppMessage.find({ conversation: conversation._id })
    .sort({ createdAt: 1 })
    .limit(300);

  res.json({
    success: true,
    data: {
      conversation: serializeConversation(conversation),
      messages: messages.map(serializeMessage),
    },
  });
});

exports.updateWhatsAppConversationFlags = catchAsync(async (req, res) => {
  const conversation = await WhatsAppConversation.findById(req.params.id);
  if (!conversation) throw new AppError("Conversation not found", 404);

  if (typeof req.body.humanTakeover === "boolean") {
    conversation.humanTakeover = req.body.humanTakeover;
    if (req.body.humanTakeover) conversation.aiEnabled = false;
  }
  if (typeof req.body.aiEnabled === "boolean") {
    conversation.aiEnabled = req.body.aiEnabled;
    if (req.body.aiEnabled) conversation.humanTakeover = false;
  }
  await conversation.save();
  res.json({ success: true, data: serializeConversation(conversation) });
});

async function loadConversationWithAccount(conversationId) {
  const conversation = await WhatsAppConversation.findById(conversationId);
  if (!conversation) throw new AppError("Conversation not found", 404);
  const account = await WhatsAppAccount.findById(conversation.account);
  if (!account || !account.isActive) throw new AppError("WhatsApp account unavailable", 404);
  return { conversation, account };
}

async function applyHumanTakeover(conversation, account) {
  const settings = await getOrCreateAISettings(account._id);
  if (settings.pauseOnHumanReply !== false) {
    conversation.humanTakeover = true;
    conversation.aiEnabled = false;
    await conversation.save();
  }
}

exports.sendWhatsAppText = catchAsync(async (req, res) => {
  const { conversation, account } = await loadConversationWithAccount(req.body.conversationId);
  const text = String(req.body.text || "").trim();
  if (!text) throw new AppError("Message text is required", 400);

  const result = await sendTextMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: conversation.customerWaId,
    text,
  });

  await applyHumanTakeover(conversation, account);
  const recorded = await recordMessage({
    accountId: account._id,
    conversationId: conversation._id,
    customerWaId: conversation.customerWaId,
    direction: "outbound",
    sender: "admin",
    type: "text",
    text,
    waMessageId: result?.messages?.[0]?.id || "",
  });

  res.json({ success: true, data: serializeMessage(recorded.message) });
});

exports.sendWhatsAppImage = catchAsync(async (req, res) => {
  const { conversation, account } = await loadConversationWithAccount(req.body.conversationId);
  const mediaUrl = String(req.body.mediaUrl || "").trim();
  if (!mediaUrl) throw new AppError("Image URL is required", 400);

  const result = await sendImageMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: conversation.customerWaId,
    imageUrl: mediaUrl,
    caption: req.body.caption || "",
  });

  await applyHumanTakeover(conversation, account);
  const recorded = await recordMessage({
    accountId: account._id,
    conversationId: conversation._id,
    customerWaId: conversation.customerWaId,
    direction: "outbound",
    sender: "admin",
    type: "image",
    text: req.body.caption || "",
    mediaUrl,
    mediaPublicId: req.body.mediaPublicId || "",
    mediaMimeType: req.body.mediaMimeType || "image/jpeg",
    waMessageId: result?.messages?.[0]?.id || "",
  });

  res.json({ success: true, data: serializeMessage(recorded.message) });
});

exports.sendWhatsAppDocument = catchAsync(async (req, res) => {
  const { conversation, account } = await loadConversationWithAccount(req.body.conversationId);
  const mediaUrl = String(req.body.mediaUrl || "").trim();
  if (!mediaUrl) throw new AppError("Document URL is required", 400);

  const filename = req.body.filename || "document.pdf";
  const result = await sendDocumentMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: conversation.customerWaId,
    documentUrl: mediaUrl,
    filename,
    caption: req.body.caption || "",
  });

  await applyHumanTakeover(conversation, account);
  const recorded = await recordMessage({
    accountId: account._id,
    conversationId: conversation._id,
    customerWaId: conversation.customerWaId,
    direction: "outbound",
    sender: "admin",
    type: "document",
    text: req.body.caption || "",
    mediaUrl,
    mediaFilename: filename,
    mediaPublicId: req.body.mediaPublicId || "",
    mediaMimeType: req.body.mediaMimeType || "application/pdf",
    waMessageId: result?.messages?.[0]?.id || "",
  });

  res.json({ success: true, data: serializeMessage(recorded.message) });
});

exports.uploadWhatsAppDocument = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Document file is required", 400);
  const result = await uploadBuffer(req.file.buffer, {
    resourceType: "raw",
    folder: "prakash-electronics/whatsapp-docs",
  });
  res.status(201).json({
    success: true,
    data: {
      url: result.secure_url,
      publicId: result.public_id,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    },
  });
});

exports.streamWhatsAppEvents = catchAsync(async (req, res) => {
  const accountId = String(req.query.accountId || "");
  const conversationId = String(req.query.conversationId || "");
  if (accountId && !mongoose.Types.ObjectId.isValid(accountId)) {
    throw new AppError("Valid accountId is required", 400);
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  addClient(res, { accountId, conversationId });

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (_error) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => clearInterval(heartbeat));
});
