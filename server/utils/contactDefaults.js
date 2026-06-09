const DEFAULT_PUBLIC_CONTACT = {
  phone: "+916200267880",
  whatsappNumber: "919006608566",
  whatsappMessage: "Hello Prakash Electronics, I need assistance with a repair of home appliances or buy products.",
  email: "prakashelectronics10@gmail.com",
  address: "Chitarpur, main road - 825101",
  shortAddress: "Chitarpur - 825101",
};

const LEGACY_PHONE_DIGITS = new Set(["9006608566", "919006608566"]);
const LEGACY_WHATSAPP_MESSAGES = new Set([
  "",
  "Hello Prakash Electronics, I need assistance with a repair.",
]);

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePublicContact(contact = {}) {
  const merged = {
    ...DEFAULT_PUBLIC_CONTACT,
    ...(contact || {}),
  };

  if (!merged.phone || LEGACY_PHONE_DIGITS.has(digits(merged.phone))) {
    merged.phone = DEFAULT_PUBLIC_CONTACT.phone;
  }

  if (!merged.whatsappNumber) {
    merged.whatsappNumber = DEFAULT_PUBLIC_CONTACT.whatsappNumber;
  }

  if (LEGACY_WHATSAPP_MESSAGES.has(String(merged.whatsappMessage || "").trim())) {
    merged.whatsappMessage = DEFAULT_PUBLIC_CONTACT.whatsappMessage;
  }

  return merged;
}

module.exports = { DEFAULT_PUBLIC_CONTACT, normalizePublicContact };
