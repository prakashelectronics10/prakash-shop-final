const crypto = require("crypto");
const CustomerWhatsAppOtp = require("../models/CustomerWhatsAppOtp");
const WhatsAppDeliveryReceipt = require("../models/WhatsAppDeliveryReceipt");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { logger } = require("../utils/logger");
const { sendOtpWhatsApp } = require("./whatsappTransactionalService");
const { deliveryReceiptId } = require("./whatsappDeliveryService");
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
  if (!["booking", "checkout", "order-history"].includes(purpose)) {
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

  let delivery;
  try {
    delivery = await sendOtpWhatsApp({ whatsappNumber, otp, customerName });
  } catch (error) {
    const metaCode = Number(error.payload?.error?.code || error.code || 0);
    const billingBlocked = [141006, 131042].includes(metaCode);
    logger.error("customer_whatsapp_otp.send_failed", {
      purpose,
      status: error.status,
      metaCode: metaCode || undefined,
      failureType: error.name,
    });
    if (billingBlocked || (error.status >= 400 && error.status < 500)) {
      await challenge.deleteOne().catch(() => undefined);
    }
    if (billingBlocked) throw new AppError("WhatsApp verification is temporarily unavailable. Please contact the shop.", 503);
    throw new AppError("WhatsApp could not confirm sending the code. Please try again.", 502);
  }

  await CustomerWhatsAppOtp.updateOne({ _id: challenge._id, otpHash }, {
    $set: { deliveryReceiptId: deliveryReceiptId(delivery.phoneNumberId, delivery.messageId) },
  }).catch((error) => logger.warn("customer_whatsapp_otp.receipt_link_failed", { code: error.code }));

  return {
    challengeId: String(challenge._id),
    expiresInMs: ttl,
    resendAvailableInMs: resendCooldown,
    maskedWhatsApp: `${whatsappNumber.slice(0, 2)}******${whatsappNumber.slice(-2)}`,
  };
}

async function getCustomerOtpDelivery({ challengeId, purpose: rawPurpose, whatsappNumber: rawNumber }) {
  if (!/^[a-f0-9]{24}$/i.test(String(challengeId || ""))) throw new AppError("Invalid verification session", 400);
  const purpose = assertPurpose(rawPurpose);
  const whatsappNumber = assertValidWhatsAppNumber(rawNumber);
  const challenge = await CustomerWhatsAppOtp.findOne({
    _id: String(challengeId), purpose, whatsappNumber,
  }).select("expiresAt +deliveryReceiptId").lean();
  if (!challenge) throw new AppError("Invalid verification session", 404);
  if (challenge.expiresAt <= new Date()) return "expired";
  if (!challenge.deliveryReceiptId) return "pending";
  const receipt = await WhatsAppDeliveryReceipt.findById(challenge.deliveryReceiptId).select("status").lean();
  if (receipt?.status === "failed") return "failed";
  return ["delivered", "read"].includes(receipt?.status) ? "delivered" : "pending";
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
  const activeChallenge = {
    _id: challenge._id,
    otpHash: challenge.otpHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: challenge.maxAttempts || 5 },
    ...(purpose === "order-history" ? { verifiedAt: null } : {}),
  };
  if (!ok) {
    await CustomerWhatsAppOtp.updateOne(activeChallenge, { $inc: { attempts: 1 } });
    throw new AppError("Incorrect code. Please try again.", 400);
  }

  const verifiedToken = createVerifiedToken();
  const verified = await CustomerWhatsAppOtp.updateOne(activeChallenge, { $set: {
    verifiedAt: new Date(),
    verifiedTokenHash: CustomerWhatsAppOtp.hashToken(verifiedToken),
    expiresAt: new Date(Date.now() + (env.whatsapp.verifiedTokenTtlMs || 15 * 60 * 1000)),
  } });
  if (!verified.modifiedCount) throw new AppError("This code can no longer be verified. Please request a new code.", 400);

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

async function verifiedOrderHistoryNumber({ challengeId, verifiedToken }) {
  if (!/^[a-f0-9]{24}$/i.test(String(challengeId || "")) || !/^[\w-]{43}$/.test(String(verifiedToken || ""))) {
    throw new AppError("Verify your WhatsApp number to view orders.", 401);
  }
  const challenge = await CustomerWhatsAppOtp.findOne({
    _id: String(challengeId),
    purpose: "order-history",
    verifiedAt: { $ne: null },
    verifiedTokenHash: CustomerWhatsAppOtp.hashToken(verifiedToken),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).select("whatsappNumber").lean();
  if (!challenge) throw new AppError("WhatsApp verification expired. Please verify again.", 401);
  return challenge.whatsappNumber;
}

async function createOrderHistoryLink(senderWaId, { phoneNumberId, businessNumber }) {
  const sender = /^(?:91)?([6-9]\d{9})$/.exec(String(senderWaId || ""));
  const businessDigits = String(businessNumber || "").replace(/\D/g, "");
  if (!sender || !phoneNumberId || !/^[1-9]\d{7,14}$/.test(businessDigits)) return null;
  const url = new URL("/orders", env.productionUrl);
  if (url.protocol !== "https:") throw new Error("Order history links require an HTTPS storefront");
  const linkToken = createVerifiedToken();
  const challenge = await CustomerWhatsAppOtp.create({
    whatsappNumber: sender[1],
    purpose: "order-history-link",
    otpHash: CustomerWhatsAppOtp.hashToken(linkToken),
    historyLinkPhoneNumberId: String(phoneNumberId),
    historyLinkBusinessNumber: businessDigits,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  url.hash = new URLSearchParams({ viewOrders: `${challenge._id}.${linkToken}` }).toString();
  return url.href;
}

async function approveOrderHistoryBrowser({ challengeId, browserHash, senderWaId, phoneNumberId }) {
  const sender = /^(?:91)?([6-9]\d{9})$/.exec(String(senderWaId || ""));
  if (!sender) return false;
  const approved = await CustomerWhatsAppOtp.findOneAndUpdate({
    _id: challengeId,
    purpose: "order-history-link",
    whatsappNumber: sender[1],
    historyLinkPhoneNumberId: String(phoneNumberId),
    expiresAt: { $gt: new Date() },
    $or: [{ historyLinkBrowserHash: { $exists: false } }, { historyLinkBrowserHash: browserHash }],
  }, { $set: { historyLinkBrowserHash: browserHash } });
  return Boolean(approved);
}

async function exchangeOrderHistoryLink(code, browserToken) {
  const match = typeof code === "string" && /^([a-f0-9]{24})\.([\w-]{43})$/i.exec(code);
  const invalid = "This WhatsApp link expired or was already used. Request a new link or verify your number.";
  if (!match || typeof browserToken !== "string" || !/^[a-f0-9]{64}$/.test(browserToken)) {
    throw new AppError(invalid, 401);
  }
  const now = new Date();
  const browserHash = CustomerWhatsAppOtp.hashToken(browserToken);
  const linkFilter = {
    _id: match[1],
    purpose: "order-history-link",
    otpHash: CustomerWhatsAppOtp.hashToken(match[2]),
    expiresAt: { $gt: now },
  };
  const link = await CustomerWhatsAppOtp.findOne(linkFilter)
    .select("+historyLinkBusinessNumber +historyLinkBrowserHash").lean();
  if (!link?.historyLinkBusinessNumber) throw new AppError(invalid, 401);
  if (!link.historyLinkBrowserHash) {
    const confirmationUrl = new URL(`https://wa.me/${link.historyLinkBusinessNumber}`);
    confirmationUrl.searchParams.set("text", `VERIFY ORDERS ${match[1]} ${browserHash}`);
    return { confirmationUrl: confirmationUrl.href };
  }
  if (link.historyLinkBrowserHash !== browserHash) throw new AppError(invalid, 401);
  const verifiedToken = createVerifiedToken();
  const expiresInMs = env.whatsapp.verifiedTokenTtlMs || 15 * 60 * 1000;
  const verified = await CustomerWhatsAppOtp.findOneAndUpdate({
    ...linkFilter,
    historyLinkBrowserHash: browserHash,
  }, { $set: {
    purpose: "order-history",
    verifiedAt: now,
    verifiedTokenHash: CustomerWhatsAppOtp.hashToken(verifiedToken),
    expiresAt: new Date(now.getTime() + expiresInMs),
  } });
  if (!verified) throw new AppError(invalid, 401);
  return { challengeId: match[1], verifiedToken, expiresInMs };
}

module.exports = {
  getCustomerOtpDelivery,
  sendCustomerWhatsAppOtp,
  verifyCustomerWhatsAppOtp,
  consumeVerifiedWhatsAppOtp,
  assertValidWhatsAppNumber,
  verifiedOrderHistoryNumber,
  createOrderHistoryLink,
  approveOrderHistoryBrowser,
  exchangeOrderHistoryLink,
};
