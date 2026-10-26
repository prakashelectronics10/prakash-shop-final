/**
 * Convert Markdown-ish AI text into WhatsApp-native formatting.
 * WhatsApp supports: *bold* _italic_ ~strike~ ```monospace```
 * It does NOT support Markdown **bold** or ## headings.
 */
function markdownToWhatsApp(text) {
  let value = String(text || "");

  // Fenced code blocks ```...``` → keep as WhatsApp monospace blocks
  value = value.replace(/```[\w]*\n?([\s\S]*?)```/g, (_match, code) => `\n\`\`\`${String(code).trim()}\`\`\`\n`);

  // Inline markdown code `code` → WhatsApp monospace
  value = value.replace(/`([^`\n]+)`/g, (_match, code) => `\`\`\`${code}\`\`\``);

  // Markdown headings → bold line
  value = value.replace(/^#{1,6}\s+(.+)$/gm, (_match, title) => `*${String(title).trim()}*`);

  // **bold** or __bold__ → *bold*
  value = value.replace(/\*\*(.+?)\*\*/g, (_match, inner) => `*${inner}*`);
  value = value.replace(/__(.+?)__/g, (_match, inner) => `*${inner}*`);

  // Lists
  value = value.replace(/^[-*]\s+/gm, "• ");

  // Markdown links [label](url) → label (url)
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)");

  value = value.replace(/\n{3,}/g, "\n\n").trim();
  return value;
}

function formatCopyCodeMessage(code, label = "Your code") {
  const clean = String(code || "").trim();
  if (!clean) return "";
  return `*${label}*\n\n\`\`\`${clean}\`\`\`\n\nUpar wale code pe tap & hold karke copy kar lo.`;
}

module.exports = {
  markdownToWhatsApp,
  formatCopyCodeMessage,
};
