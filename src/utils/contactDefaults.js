export const DEFAULT_PUBLIC_CONTACT = {
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

export function contactDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeWhatsappNumber(value) {
  const digits = contactDigits(value);
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function normalizePublicContact(contact = {}) {
  const merged = {
    ...DEFAULT_PUBLIC_CONTACT,
    ...(contact || {}),
  };

  if (!merged.phone || LEGACY_PHONE_DIGITS.has(contactDigits(merged.phone))) {
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

export function getPhoneHref(contact = {}) {
  const normalized = normalizePublicContact(contact);
  return `tel:${normalized.phone.replace(/\s+/g, "")}`;
}

export function getWhatsappHref(contact = {}) {
  const normalized = normalizePublicContact(contact);
  const number = normalizeWhatsappNumber(normalized.whatsappNumber);
  if (!number) return "";
  return `https://wa.me/${number}?text=${encodeURIComponent(normalized.whatsappMessage)}`;
}
