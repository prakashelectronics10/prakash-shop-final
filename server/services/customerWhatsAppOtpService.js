const crypto = require("crypto");
const CustomerWhatsAppOtp = require("../models/CustomerWhatsAppOtp");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { logger } = require("../utils/logger");
const { sendOtpWhatsApp } = require("./whatsappTransactionalService");
const { toLocalTenDigit } = require("./whatsappAccountService");

/** Match Meta AUTH template example length (6 digits). */
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function createVerifiedToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function assertValidWhatsAppNumber(raw) {
  const whatsappNumber = toLocalTenDigit(raw);
  if (!/^[6-9]\d{9}$/.test(whatsappNumber)) {
    throw new AppError("Valid 10-digit WhatsApp number required", 400);
  }
  return whatsappNumber;
}

function assertPurpose(purpose) {
  if (!["booking", "checkout"].includes(purpose)) {
    throw new AppError("Invalid OTP purpose", 400);
  }
  return purpose;
}

async function sendCustomerWhatsAppOtp({
  whatsappNumber: rawNumber,
  purpose: rawPurpose,
  customerName = "",
  resendChallengeId = "",
}) {
  const whatsappNumber = assertValidWhatsAppNumber(rawNumber);
  const purpose = assertPurpose(rawPurpose);
  const ttl = env.whatsapp.customerOtpExpiresMs || 5 * 60 * 1000;
  const resendCooldown = env.whatsapp.customerOtpResendCooldownMs || 45 * 1000;
  const maxResends = env.whatsapp.customerOtpMaxResends || 4;

  let challenge = null;
  if (resendChallengeId) {
    challenge = await CustomerWhatsAppOtp.findById(resendChallengeId).select("+otpHash +verifiedTokenHash");
    if (!challenge || challenge.whatsappNumber !== whatsappNumber || challenge.purpose !== purpose) {
      throw new AppError("OTP session not found. Please request a new code.", 400);
    }
    if (challenge.usedAt) {
      throw new AppError("This verification was already used. Please request a new code.", 400);
    }
    if (challenge.resendCount >= maxResends) {
      throw new AppError("Resend limit reached. Please try again later.", 429);
    }
    const sinceLast = Date.now() - new Date(challenge.lastSentAt || 0).getTime();
    if (sinceLast < resendCooldown) {
      const waitSec = Math.ceil((resendCooldown - sinceLast) / 1000);
      throw new AppError(`Please wait ${waitSec}s before requesting another code.`, 429);
    }
  }

  const otp = generateOtp();
  const otpHash = await CustomerWhatsAppOtp.hashOtp(otp);

  if (challenge) {
    challenge.otpHash = otpHash;
    challenge.verifiedAt = null;
    challenge.verifiedTokenHash = "";
    challenge.attempts = 0;
    challenge.resendCount += 1;
    challenge.lastSentAt = new Date();
    challenge.expiresAt = new Date(Date.now() + ttl);
    if (customerName) challenge.customerName = customerName;
    await challenge.save();
  } else {
    // Invalidate older unused challenges for same number+purpose
    await CustomerWhatsAppOtp.updateMany(
      {
        whatsappNumber,
        purpose,
        usedAt: null,
        verifiedAt: null,
      },
      { $set: { expiresAt: new Date() } },
    );

    challenge = await CustomerWhatsAppOtp.create({
      whatsappNumber,
      purpose,
      otpHash,
      customerName: String(customerName || "").trim().slice(0, 100),
      expiresAt: new Date(Date.now() + ttl),
      maxAttempts: env.whatsapp.customerOtpMaxAttempts || 5,
      lastSentAt: new Date(),
    });
  }

  try {
    await sendOtpWhatsApp({ whatsappNumber, otp, customerName });
  } catch (error) {
    logger.error("customer_whatsapp_otp.send_failed", {
      whatsappNumber,
      purpose,
      message: error.message,
    });
    if (env.nodeEnv !== "production") {
      // eslint-disable-next-line no-console
      console.log(`\n[DEV WHATSAPP OTP] ${purpose} → ${whatsappNumber}: ${otp}\n`);
    } else {
      await challenge.deleteOne().catch(() => undefined);
      throw new AppError(error.message || "Unable to send WhatsApp OTP", error.status || 502);
    }
  }

  if (env.nodeEnv !== "production") {
    logger.info("customer_whatsapp_otp.dev", { whatsappNumber, purpose, otp });
  }

  return {
    challengeId: String(challenge._id),
    expiresInMs: ttl,
    resendAvailableInMs: resendCooldown,
    maskedWhatsApp: `${whatsappNumber.slice(0, 2)}******${whatsappNumber.slice(-2)}`,
  };
}

async function verifyCustomerWhatsAppOtp({
  challengeId,
  otp,
  whatsappNumber: rawNumber,
  purpose: rawPurpose,
}) {
  const whatsappNumber = assertValidWhatsAppNumber(rawNumber);
  const purpose = assertPurpose(rawPurpose);
  const cleanOtp = String(otp || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new AppError("Enter the 6-digit code sent on WhatsApp", 400);
  }

  const challenge = await CustomerWhatsAppOtp.findById(challengeId).select("+otpHash +verifiedTokenHash");
  if (!challenge || challenge.whatsappNumber !== whatsappNumber || challenge.purpose !== purpose) {
    throw new AppError("Invalid or expired verification session", 400);
  }
  if (challenge.usedAt) {
    throw new AppError("This verification was already used", 400);
  }
  if (challenge.expiresAt && challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError("OTP expired. Please request a new code.", 400);
  }
  if (challenge.attempts >= (challenge.maxAttempts || 5)) {
    throw new AppError("Too many incorrect attempts. Please request a new code.", 429);
  }

  const ok = await challenge.compareOtp(cleanOtp);
  if (!ok) {
    challenge.attempts += 1;
    await challenge.save();
    throw new AppError("Incorrect code. Please try again.", 400);
  }

  const verifiedToken = createVerifiedToken();
  challenge.verifiedAt = new Date();
  challenge.verifiedTokenHash = CustomerWhatsAppOtp.hashToken(verifiedToken);
  challenge.expiresAt = new Date(Date.now() + (env.whatsapp.verifiedTokenTtlMs || 15 * 60 * 1000));
  await challenge.save();

  return {
    challengeId: String(challenge._id),
    verifiedToken,
    whatsappNumber,
    purpose,
    expiresInMs: env.whatsapp.verifiedTokenTtlMs || 15 * 60 * 1000,
  };
}

/**
 * Consume a verified WhatsApp OTP token for booking/checkout.
 * Returns the local 10-digit WhatsApp number on success.
 */
async function consumeVerifiedWhatsAppOtp({
  challengeId,
  verifiedToken,
  whatsappNumber: rawNumber,
  purpose: rawPurpose,
}) {
  const whatsappNumber = assertValidWhatsAppNumber(rawNumber);
  const purpose = assertPurpose(rawPurpose);
  if (!challengeId || !verifiedToken) {
    throw new AppError("WhatsApp verification required", 400);
  }

  const challenge = await CustomerWhatsAppOtp.findById(challengeId).select("+verifiedTokenHash +otpHash");
  if (!challenge || challenge.whatsappNumber !== whatsappNumber || challenge.purpose !== purpose) {
    throw new AppError("WhatsApp verification is invalid. Please verify again.", 400);
  }
  if (!challenge.verifiedAt || !challenge.verifiedTokenHash) {
    throw new AppError("Please complete WhatsApp OTP verification first", 400);
  }
  if (challenge.usedAt) {
    throw new AppError("This WhatsApp verification was already used", 400);
  }
  if (challenge.expiresAt && challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError("WhatsApp verification expired. Please verify again.", 400);
  }

  const tokenHash = CustomerWhatsAppOtp.hashToken(verifiedToken);
  if (tokenHash !== challenge.verifiedTokenHash) {
    throw new AppError("WhatsApp verification is invalid. Please verify again.", 400);
  }

  challenge.usedAt = new Date();
  await challenge.save();
  return { whatsappNumber, challengeId: String(challenge._id) };
}

module.exports = {
  sendCustomerWhatsAppOtp,
  verifyCustomerWhatsAppOtp,
  consumeVerifiedWhatsAppOtp,
  assertValidWhatsAppNumber,
};
