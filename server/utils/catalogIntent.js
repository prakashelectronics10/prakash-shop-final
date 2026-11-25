function normalizeWirelessPlayerIntent(search) {
  if (!/\b(?:bluetooth|wireless)\b/i.test(search)) return search;
  return search.replace(/\b(?:song|music|audio)[\s-]+players?\b/gi, "speaker");
}

module.exports = { normalizeWirelessPlayerIntent };
