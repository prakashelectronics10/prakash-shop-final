const MAX_CHAT_TITLE_LENGTH = 60;

function sanitizeChatTitle(value) {
  let title = String(value || "")
    .replace(/^CHAT_TITLE\s*:\s*/i, "")
    .replace(/^[`"']+|[`"']+$/g, "")
    .replace(/[*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…,;:]+$/g, "")
    .trim();

  if (title.length > MAX_CHAT_TITLE_LENGTH) {
    title = title.slice(0, MAX_CHAT_TITLE_LENGTH + 1).replace(/\s+\S*$/, "").trim();
  }

  return title;
}

function extractChatTitleMetadata(text) {
  const match = String(text || "").match(/^\s*CHAT_TITLE\s*:\s*(.+?)\s*$/im);
  if (!match) return "";

  const raw = match[1].trim();
  if (raw.startsWith('"')) {
    try {
      return sanitizeChatTitle(JSON.parse(raw));
    } catch (_error) {
      // Fall through to the tolerant plain-text sanitizer.
    }
  }
  return sanitizeChatTitle(raw);
}

function stripChatTitleMetadata(text) {
  return String(text || "")
    .replace(/^\s*CHAT_TITLE\s*:\s*.*(?:\r?\n|$)/gim, "")
    .trim();
}

function fallbackChatTitle(message, hasImages = false) {
  const prompt = String(message || "").toLowerCase();
  if (hasImages && /repair|service|ac|cooler|fan|tv/.test(prompt)) return "Repair Image Assistance";
  if (hasImages) return "Product Image Analysis";
  if (/order|track|delivery|shipping/.test(prompt)) return "Order and Delivery Help";
  if (/repair|service|fix|problem|issue/.test(prompt)) return "Repair Service Assistance";
  if (/offer|coupon|discount|price|budget/.test(prompt)) return "Pricing and Offers Help";
  if (/wire|wiring|switch|socket|mcb|cable/.test(prompt)) return "Wiring Product Guidance";
  if (/product|shop|buy|recommend|suggest|find/.test(prompt)) return "Product Selection Help";
  return "Customer Support Conversation";
}

module.exports = {
  extractChatTitleMetadata,
  fallbackChatTitle,
  sanitizeChatTitle,
  stripChatTitleMetadata,
};
