const crypto = require("crypto");
const mongoose = require("mongoose");
const AdminOtpChallenge = require("../models/AdminOtpChallenge");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { logger } = require("../utils/logger");
const { getDeviceInfo } = require("./adminSessionService");
const { sendOtpEmail } = require("./mailService");

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function maskEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!domain) return "";
  const maskedLocal = local.length <= 2 ? `${local[0] || ""}***` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}

function assertValidObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid OTP request", 400);
  }
}

async function createOtpChallenge({ admin, purpose, req, payload = null, requesterSession = null, secondaryEmail = "" }) {
  const otp = generateOtp();
  const otpHash = await AdminOtpChallenge.hashOtp(otp);
  const secondaryOtp = secondaryEmail ? generateOtp() : "";
  const secondaryOtpHash = secondaryOtp ? await AdminOtpChallenge.hashOtp(secondaryOtp) : "";
  const challenge = await AdminOtpChallenge.create({
    admin: admin._id,
    email: admin.email,
    purpose,
    otpHash,
    payload,
    secondaryEmail,
    secondaryOtpHash,
    requesterSession,
    ...getDeviceInfo(req),
    expiresAt: new Date(Date.now() + env.otpExpiresMs),
    maxAttempts: env.otpMaxAttempts,
    lastSentAt: new Date(),
  });

  try {
    logger.info("otp.email_sending", { to: admin.email, purpose, challengeId: String(challenge._id) });
    await sendOtpEmail({ to: admin.email, otp, purpose });
    if (secondaryEmail && secondaryOtp) {
      logger.info("otp.secondary_email_sending", { to: secondaryEmail, purpose: "admin-create-new", challengeId: String(challenge._id) });
      await sendOtpEmail({ to: secondaryEmail, otp: secondaryOtp, purpose: "admin-create-new" });
    }
    logger.info("otp.email_sent", { to: admin.email, purpose, challengeId: String(challenge._id) });
  } catch (error) {
    logger.error("otp.email_failed", { to: admin.email, purpose, challengeId: String(challenge._id), error: error.message });
    await challenge.deleteOne();
    throw error;
  }

  return challenge;
}

async function verifyAdminCreateChallenge({ challengeId, ownerOtp, newAdminOtp, adminId, requesterSession }) {
  assertValidObjectId(challengeId);
  const challenge = await AdminOtpChallenge.findById(challengeId).select("+otpHash +secondaryOtpHash");

  if (!challenge || challenge.purpose !== "admin-create") {
    throw new AppError("Invalid OTP request", 400);
  }

  if (adminId && String(challenge.admin) !== String(adminId)) {
    throw new AppError("Invalid OTP request", 400);
  }

  if (requesterSession && String(challenge.requesterSession || "") !== String(requesterSession)) {
    throw new AppError("Invalid OTP request", 400);
  }

  if (challenge.consumedAt) {
    throw new AppError("OTP already used. Request a new OTP.", 400);
  }

  if (challenge.expiresAt <= new Date()) {
    throw new AppError("OTP expired. Please resend OTP.", 400);
  }

  if (challenge.attempts >= challenge.maxAttempts || challenge.secondaryAttempts >= challenge.maxAttempts) {
    throw new AppError("Too many OTP attempts. Request a new OTP.", 429);
  }

  const [ownerMatches, secondaryMatches] = await Promise.all([
    challenge.compareOtp(ownerOtp),
    challenge.compareSecondaryOtp(newAdminOtp),
  ]);

  if (!ownerMatches || !secondaryMatches) {
    if (!ownerMatches) challenge.attempts += 1;
    if (!secondaryMatches) challenge.secondaryAttempts += 1;
    if (challenge.attempts >= challenge.maxAttempts || challenge.secondaryAttempts >= challenge.maxAttempts) {
      challenge.consumedAt = new Date();
    }
    await challenge.save();
    throw new AppError("Invalid OTP. Verify both main admin and new admin OTP codes.", 401);
  }

  challenge.consumedAt = new Date();
  await challenge.save();
  return challenge;
}

async function verifyOtpChallenge({ challengeId, otp, adminId, purpose, requesterSession }) {
  assertValidObjectId(challengeId);
  const challenge = await AdminOtpChallenge.findById(challengeId).select("+otpHash");

  if (!challenge || challenge.purpose !== purpose) {
    throw new AppError("Invalid OTP request", 400);
  }

  if (adminId && String(challenge.admin) !== String(adminId)) {
    throw new AppError("Invalid OTP request", 400);
  }

  if (requesterSession && String(challenge.requesterSession || "") !== String(requesterSession)) {
    throw new AppError("Invalid OTP request", 400);
  }

  if (challenge.consumedAt) {
    throw new AppError("OTP already used. Request a new OTP.", 400);
  }

  if (challenge.expiresAt <= new Date()) {
    throw new AppError("OTP expired. Please resend OTP.", 400);
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new AppError("Too many OTP attempts. Request a new OTP.", 429);
  }

  const matches = await challenge.compareOtp(otp);
  if (!matches) {
    challenge.attempts += 1;
    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.consumedAt = new Date();
    }
    await challenge.save();
    throw new AppError("Invalid OTP", 401);
  }

  challenge.consumedAt = new Date();
  await challenge.save();
  return challenge;
}

async function resendOtpChallenge({ challengeId, adminId, purpose, requesterSession }) {
  assertValidObjectId(challengeId);
  const challenge = await AdminOtpChallenge.findById(challengeId).select("+otpHash +secondaryOtpHash");

  if (!challenge || challenge.purpose !== purpose || (adminId && String(challenge.admin) !== String(adminId))) {
    throw new AppError("Invalid OTP request", 400);
  }

  if (requesterSession && String(challenge.requesterSession || "") !== String(requesterSession)) {
    throw new AppError("Invalid OTP request", 400);
  }

  if (challenge.consumedAt) {
    throw new AppError("OTP already used. Start again.", 400);
  }

  const now = Date.now();
  if (challenge.lastSentAt && now - challenge.lastSentAt.getTime() < env.otpResendCooldownMs) {
    throw new AppError("Please wait before resending OTP", 429);
  }

  if (challenge.resendCount >= env.otpMaxResends) {
    throw new AppError("OTP resend limit reached. Start again.", 429);
  }

  const previousState = {
    otpHash: challenge.otpHash,
    secondaryOtpHash: challenge.secondaryOtpHash,
    secondaryAttempts: challenge.secondaryAttempts,
    expiresAt: challenge.expiresAt,
    attempts: challenge.attempts,
    resendCount: challenge.resendCount,
    lastSentAt: challenge.lastSentAt,
  };
  const otp = generateOtp();
  const secondaryOtp = challenge.secondaryEmail ? generateOtp() : "";
  challenge.otpHash = await AdminOtpChallenge.hashOtp(otp);
  if (secondaryOtp) {
    challenge.secondaryOtpHash = await AdminOtpChallenge.hashOtp(secondaryOtp);
    challenge.secondaryAttempts = 0;
  }
  challenge.expiresAt = new Date(Date.now() + env.otpExpiresMs);
  challenge.attempts = 0;
  challenge.resendCount += 1;
  challenge.lastSentAt = new Date();

  await challenge.save();
  try {
    logger.info("otp.email_resending", { to: challenge.email, purpose, challengeId: String(challenge._id), resendCount: challenge.resendCount });
    await sendOtpEmail({ to: challenge.email, otp, purpose });
    if (secondaryOtp) {
      logger.info("otp.secondary_email_resending", { to: challenge.secondaryEmail, purpose: "admin-create-new", challengeId: String(challenge._id) });
      await sendOtpEmail({ to: challenge.secondaryEmail, otp: secondaryOtp, purpose: "admin-create-new" });
    }
    logger.info("otp.email_resent", { to: challenge.email, purpose, challengeId: String(challenge._id), resendCount: challenge.resendCount });
  } catch (error) {
    logger.error("otp.email_resend_failed", {
      to: challenge.email,
      purpose,
      challengeId: String(challenge._id),
      resendCount: challenge.resendCount,
      error: error.message,
    });
    Object.assign(challenge, previousState);
    await challenge.save();
    throw error;
  }
  return challenge;
}

module.exports = {
  createOtpChallenge,
  maskEmail,
  resendOtpChallenge,
  verifyAdminCreateChallenge,
  verifyOtpChallenge,
};
