const WhatsAppAccount = require("../models/WhatsAppAccount");
const env = require("../config/env");

function toWhatsAppE164(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function toLocalTenDigit(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits.slice(-10);
}

async function ensureAccountFromEnv() {
  if (!env.whatsapp.phoneNumberId || !env.whatsapp.accessToken || !env.whatsapp.businessAccountId) {
    return null;
  }
  return WhatsAppAccount.findOneAndUpdate(
    { phoneNumberId: env.whatsapp.phoneNumberId },
    {
      $setOnInsert: {
        label: "Primary (from .env)",
        phoneNumberId: env.whatsapp.phoneNumberId,
        businessAccountId: env.whatsapp.businessAccountId,
        accessToken: env.whatsapp.accessToken,
        isActive: true,
        notes: "Auto-created from server environment",
      },
      $set: {
        accessToken: env.whatsapp.accessToken,
        businessAccountId: env.whatsapp.businessAccountId,
        isActive: true,
      },
    },
    { upsert: true, new: true },
  );
}

async function getActiveWhatsAppAccount() {
  if (!env.whatsapp.enabled) return null;
  const account = await WhatsAppAccount.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (account?.phoneNumberId && account?.accessToken) return account;
  return ensureAccountFromEnv();
}

module.exports = {
  toWhatsAppE164,
  toLocalTenDigit,
  getActiveWhatsAppAccount,
  ensureAccountFromEnv,
};
