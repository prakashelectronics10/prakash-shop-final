const mongoose = require("mongoose");
const catchAsync = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const WhatsAppGreeting = require("../models/WhatsAppGreeting");
const { resolveOgImage } = require("../services/ogImageService");
const { sanitizeButtons } = require("../services/whatsappGreetingService");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");
const env = require("../config/env");

function maskToken(token) {
  const value = String(token || "");
  if (value.length < 12) return value ? "••••" : "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function serializeAccount(account, { includeToken = false } = {}) {
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
    ...(includeToken ? { accessToken: doc.accessToken } : {}),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeGreeting(greeting) {
  if (!greeting) return null;
  const doc = greeting.toObject ? greeting.toObject() : { ...greeting };
  return {
    id: String(doc._id),
    _id: String(doc._id),
    accountId: String(doc.account),
    enabled: doc.enabled !== false,
    bodyText: doc.bodyText || "",
    footerText: doc.footerText || "",
    imageUrl: doc.imageUrl || "",
    imagePublicId: doc.imagePublicId || "",
    imageSourceUrl: doc.imageSourceUrl || "",
    buttons: Array.isArray(doc.buttons) ? doc.buttons : [],
    updatedAt: doc.updatedAt,
  };
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
  if (existing) {
    throw new AppError("An account with this Phone Number ID already exists", 409);
  }

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
  if (payload.accessToken) {
    account.accessToken = payload.accessToken;
  }
  await account.save();

  res.json({ success: true, data: serializeAccount(account) });
});

exports.deleteWhatsAppAccount = catchAsync(async (req, res) => {
  const account = await WhatsAppAccount.findById(req.params.id);
  if (!account) throw new AppError("WhatsApp account not found", 404);

  const greeting = await WhatsAppGreeting.findOne({ account: account._id });
  if (greeting?.imagePublicId) {
    await deleteImagesStrict(collectPublicIdsFromSources(greeting.imagePublicId));
  }
  await WhatsAppGreeting.deleteOne({ account: account._id });
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
  const nextImagePublicId = payload.imagePublicId || "";
  if (existing?.imagePublicId && existing.imagePublicId !== nextImagePublicId) {
    await deleteImagesStrict(collectPublicIdsFromSources(existing.imagePublicId));
  }

  const greeting = await WhatsAppGreeting.findOneAndUpdate(
    { account: account._id },
    {
      $set: {
        enabled: payload.enabled !== false,
        bodyText: payload.bodyText || "",
        footerText: payload.footerText || "",
        imageUrl: payload.imageUrl || "",
        imagePublicId: nextImagePublicId,
        imageSourceUrl: payload.imageSourceUrl || "",
        buttons: sanitizeButtons(payload.buttons),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({ success: true, data: serializeGreeting(greeting) });
});

exports.resolveWhatsAppOgImage = catchAsync(async (req, res) => {
  const result = await resolveOgImage(req.body.url);
  res.json({ success: true, data: result });
});
