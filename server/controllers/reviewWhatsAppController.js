const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Types } = require("mongoose");
const CustomerWhatsAppOtp = require("../models/CustomerWhatsAppOtp");
const ReviewWhatsAppOtp = require("../models/ReviewWhatsAppOtp");
const ReviewWhatsAppSettings = require("../models/ReviewWhatsAppSettings");
const transactionalWhatsApp = require("../services/whatsappTransactionalService");
const { SETTINGS_ID, alertsAvailable } = require("../services/reviewWhatsAppService");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { logger } = require("../utils/logger");

const MAX_OTP_ATTEMPTS = 5;
const objectId = /^[a-f\d]{24}$/i;

function normalizeNumber(value) {
  if (typeof value !== "string" || !/^\+?[\d ()-]{10,24}$/.test(value.trim())) {
    throw new AppError("Enter a valid Indian WhatsApp number.", 400);
  }
  const number = value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(number)) throw new AppError("Enter a valid Indian WhatsApp number.", 400);
  return number;
}

function respond(res, settings) {
  const recipients = (settings?.recipients || []).map(({ _id, whatsappNumber, verifiedAt }) => ({ _id, whatsappNumber, verifiedAt }));
  res.set("Cache-Control", "no-store").json({ success: true, data: { enabled: Boolean(settings?.enabled), available: alertsAvailable(), recipients } });
}

exports.getSettings = asyncHandler(async (_req, res) => {
  respond(res, await ReviewWhatsAppSettings.findById(SETTINGS_ID).lean());
});

exports.setEnabled = asyncHandler(async (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") throw new AppError("Choose whether WhatsApp alerts are enabled.", 400);
  if (enabled && !alertsAvailable()) throw new AppError("WhatsApp alerts require a configured account and signed webhook.", 503);
  const settings = await ReviewWhatsAppSettings.findOneAndUpdate({ _id: SETTINGS_ID }, [
    { $set: { enabled, generation: { $cond: [{ $eq: ["$enabled", enabled] }, "$generation", new Types.ObjectId()] } } },
  ], { new: true, upsert: true });
  respond(res, settings);
});

exports.sendOtp = asyncHandler(async (req, res) => {
  const whatsappNumber = normalizeNumber(req.body?.whatsappNumber);
  const sessionId = req.adminSession._id;
  if (await ReviewWhatsAppSettings.exists({ _id: SETTINGS_ID, "recipients.whatsappNumber": whatsappNumber })) {
    throw new AppError("This WhatsApp number is already verified and added.", 409);
  }
  const now = new Date();
  const ttl = env.whatsapp.customerOtpExpiresMs;
  const cooldown = env.whatsapp.customerOtpResendCooldownMs;
  const challengeId = new Types.ObjectId();
  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = await CustomerWhatsAppOtp.hashOtp(otp);
  try {
    await ReviewWhatsAppOtp.updateOne({ _id: sessionId, lastSentAt: { $lte: new Date(now.getTime() - cooldown) } }, {
      $set: { challengeId, whatsappNumber, otpHash, attempts: 0, lastSentAt: now, expiresAt: new Date(now.getTime() + ttl) },
    }, { upsert: true });
  } catch (error) {
    if (error.code === 11000) throw new AppError("Please wait before requesting another WhatsApp code.", 429);
    throw error;
  }
  try {
    await transactionalWhatsApp.sendOtpWhatsApp({ whatsappNumber, otp });
  } catch (error) {
    await ReviewWhatsAppOtp.deleteOne({ _id: sessionId, challengeId });
    logger.warn("review_whatsapp.otp_send_failed", { status: error.status, metaCode: error.payload?.error?.code });
    throw new AppError("WhatsApp could not send the code. Please try again.", 502);
  }
  res.set("Cache-Control", "no-store").json({ success: true, data: { challengeId, resendAvailableInMs: cooldown } });
});

exports.addRecipient = asyncHandler(async (req, res) => {
  const { challengeId, otp } = req.body || {};
  if (typeof challengeId !== "string" || !objectId.test(challengeId) || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    throw new AppError("Enter the 6-digit code sent on WhatsApp.", 400);
  }
  const owner = { _id: req.adminSession._id, challengeId };
  const claim = await ReviewWhatsAppOtp.findOneAndUpdate({
    ...owner, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_OTP_ATTEMPTS },
  }, { $inc: { attempts: 1 } }, { new: true });
  if (!claim) throw new AppError("This code expired or has too many incorrect attempts. Request a new code.", 400);
  if (!(await bcrypt.compare(otp, claim.otpHash))) throw new AppError("Incorrect code. Please try again.", 400);
  const used = await ReviewWhatsAppOtp.deleteOne({ ...owner, expiresAt: { $gt: new Date() } });
  if (!used.deletedCount) throw new AppError("This verification is no longer available. Request a new code.", 400);

  await ReviewWhatsAppSettings.updateOne({ _id: SETTINGS_ID }, { $setOnInsert: { enabled: false } }, { upsert: true });
  const settings = await ReviewWhatsAppSettings.findOneAndUpdate({ _id: SETTINGS_ID, "recipients.whatsappNumber": { $ne: claim.whatsappNumber } }, {
    $push: { recipients: { whatsappNumber: claim.whatsappNumber, verifiedAt: new Date(), addedBy: req.admin._id } },
  }, { new: true });
  if (!settings) throw new AppError("This WhatsApp number is already verified and added.", 409);
  respond(res, settings);
});

exports.removeRecipient = asyncHandler(async (req, res) => {
  if (!objectId.test(req.params.id)) throw new AppError("Invalid WhatsApp recipient.", 400);
  const settings = await ReviewWhatsAppSettings.findByIdAndUpdate(SETTINGS_ID, {
    $pull: { recipients: { _id: req.params.id } },
  }, { new: true });
  respond(res, settings);
});
