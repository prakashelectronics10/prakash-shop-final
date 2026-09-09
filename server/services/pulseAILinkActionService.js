const configuredHost = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch (_error) {
    return "";
  }
};

const DEFAULT_SITE_HOSTS = new Set([
  "prakashshop.in",
  "www.prakashshop.in",
  "localhost",
  "127.0.0.1",
  configuredHost(process.env.PRODUCTION_DOMAIN),
  configuredHost(process.env.PRODUCTION_URL),
  configuredHost(process.env.FRONTEND_URL || process.env.CLIENT_URL),
].filter(Boolean));

const STOP_WORDS = new Set([
  "a",
  "about",
  "ai",
  "and",
  "ask",
  "asks",
  "card",
  "customer",
  "customers",
  "for",
  "hai",
  "hain",
  "instruction",
  "jab",
  "ka",
  "ke",
  "ki",
  "ko",
  "link",
  "me",
  "mein",
  "of",
  "on",
  "only",
  "page",
  "please",
  "related",
  "show",
  "specific",
  "the",
  "to",
  "user",
  "users",
  "when",
  "with",
]);

const INTENT_FAMILIES = {
  warranty: [
    "activate warranty",
    "guarantee",
    "garanti",
    "registration",
    "register warranty",
    "waranty",
    "warranty",
  ],
  support: [
    "complaint",
    "customer care",
    "customer support",
    "help desk",
    "helpdesk",
    "support",
  ],
  contact: ["call us", "contact", "email us", "phone", "whatsapp"],
  returns: ["cancel order", "cancellation", "exchange", "refund", "return"],
  tracking: ["delivery status", "order status", "shipment", "track order", "tracking"],
  booking: ["appointment", "book", "booking", "schedule visit"],
  repair: ["installation", "maintenance", "repair", "service request"],
  payment: ["checkout", "finance", "payment", "pay now"],
  privacy: ["data policy", "privacy", "privacy policy"],
  terms: ["conditions", "legal terms", "terms and conditions", "terms"],
  download: ["brochure", "catalogue", "catalog", "download", "manual"],
  quote: ["estimate", "quotation", "quote"],
};

const INTENT_TOKENS = new Set([
  ...Object.values(INTENT_FAMILIES).flatMap((phrases) => phrases.flatMap((phrase) => phrase.split(" "))),
  "activate",
  "check",
  "checking",
  "register",
  "registered",
  "registering",
]);

const GENERIC_CARD_LABEL_TOKENS = new Set([
  "action",
  "details",
  "help",
  "official",
  "online",
  "portal",
  "request",
]);

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const meaningfulTokens = (value) =>
  normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const detectIntentFamilies = (value) => {
  const normalized = normalizeText(value);
  return Object.entries(INTENT_FAMILIES)
    .filter(([, phrases]) => phrases.some((phrase) => normalized.includes(normalizeText(phrase))))
    .map(([family]) => family);
};

const normalizedHosts = (siteHosts = DEFAULT_SITE_HOSTS) => {
  const hosts = siteHosts instanceof Set ? [...siteHosts] : siteHosts;
  return new Set((hosts || []).map((host) => String(host).trim().toLowerCase()).filter(Boolean));
};

const parseAbsoluteUrl = (value) => {
  try {
    return new URL(value);
  } catch (_error) {
    return null;
  }
};

const isProductDetailUrl = (value) => {
  const raw = String(value || "").trim();
  try {
    const pathname = raw.startsWith("/") ? raw.split(/[?#]/)[0] : new URL(raw).pathname;
    return /^\/(?:product|product-detail)(?:\/|$)/i.test(pathname);
  } catch (_error) {
    return false;
  }
};

const resolveLinkType = (action = {}, options = {}) => {
  const configuredType = ["auto", "internal", "external"].includes(action.type)
    ? action.type
    : "auto";
  if (configuredType !== "auto") return configuredType;

  const value = String(action.url || "").trim();
  if (value.startsWith("/") && !value.startsWith("//")) return "internal";

  const parsed = parseAbsoluteUrl(value);
  const hosts = normalizedHosts(options.siteHosts);
  if (parsed && hosts.has(parsed.hostname.toLowerCase())) return "internal";
  return "external";
};

const validateLinkAction = (action = {}, options = {}) => {
  if (!action || action.enabled !== true) {
    return { valid: true, type: resolveLinkType(action, options), url: String(action?.url || "").trim() };
  }

  const title = String(action.title || "").trim();
  const url = String(action.url || "").trim();
  const trigger = String(action.trigger || "").trim();
  const type = resolveLinkType(action, options);

  if (!title) return { valid: false, message: "Link card title is required.", type, url };
  if (!url) return { valid: false, message: "Link card URL is required.", type, url };
  if (!trigger) return { valid: false, message: "Link card trigger/intent is required.", type, url };
  if (isProductDetailUrl(url)) {
    return { valid: false, message: "Product detail links must use Pulse AI product suggestion cards.", type, url };
  }

  if (url.startsWith("//")) {
    return { valid: false, message: "Protocol-relative URLs are not allowed.", type, url };
  }

  if (url.startsWith("/") && !url.startsWith("//")) {
    if (type === "external") {
      return { valid: false, message: "External links must use a full HTTPS URL.", type, url };
    }
    return { valid: true, type: "internal", url };
  }

  const parsed = parseAbsoluteUrl(url);
  if (!parsed || parsed.protocol !== "https:") {
    return {
      valid: false,
      message: "Use an internal route beginning with / or a full HTTPS URL.",
      type,
      url,
    };
  }

  if (type === "internal" && !normalizedHosts(options.siteHosts).has(parsed.hostname.toLowerCase())) {
    return {
      valid: false,
      message: "Internal absolute URLs must use the website domain.",
      type,
      url,
    };
  }

  return { valid: true, type, url };
};

const instructionId = (instruction) => String(instruction?._id || instruction?.id || "").trim();

const actionSearchText = (instruction) =>
  [
    instruction?.linkAction?.trigger,
    instruction?.linkAction?.title,
    instruction?.linkAction?.description,
    instruction?.target,
    instruction?.title,
  ]
    .filter(Boolean)
    .join(" ");

const scoreLinkActionRelevance = (promptText, instruction) => {
  const prompt = normalizeText(promptText);
  const actionText = actionSearchText(instruction);
  const action = normalizeText(actionText);
  if (!prompt || !action || instruction?.isActive === false || instruction?.linkAction?.enabled !== true) {
    return { relevant: false, score: 0, reason: "inactive-or-empty" };
  }

  const promptFamilies = detectIntentFamilies(prompt);
  const actionFamilies = detectIntentFamilies(action);
  const sharedFamilies = actionFamilies.filter((family) => promptFamilies.includes(family));

  // Action-oriented triggers (warranty, returns, tracking, etc.) must share the
  // same intent. Product/category word overlap alone is deliberately insufficient.
  if (actionFamilies.length && !sharedFamilies.length) {
    return { relevant: false, score: 0, reason: "intent-mismatch" };
  }

  const promptTokenSet = new Set(meaningfulTokens(prompt));
  const titleQualifiers = [...new Set(meaningfulTokens(instruction?.linkAction?.title))]
    .filter((token) => !INTENT_TOKENS.has(token) && !GENERIC_CARD_LABEL_TOKENS.has(token));
  if (actionFamilies.length && titleQualifiers.some((token) => !promptTokenSet.has(token))) {
    return { relevant: false, score: 0, reason: "qualifier-mismatch" };
  }
  const actionTokens = [...new Set(meaningfulTokens(actionText))];
  const overlap = actionTokens.filter((token) => promptTokenSet.has(token));
  const overlapRatio = actionTokens.length ? overlap.length / actionTokens.length : 0;
  const triggerPhrase = normalizeText(instruction?.linkAction?.trigger);
  const exactPhrase = triggerPhrase.length >= 4 && prompt.includes(triggerPhrase);

  let score = 0;
  if (exactPhrase) score += 100;
  score += sharedFamilies.length * 45;
  score += overlap.length * 8;
  score += Math.round(overlapRatio * 35);

  const relevant = actionFamilies.length
    ? sharedFamilies.length > 0 && (overlap.length > 0 || score >= 45)
    : exactPhrase || overlap.length >= 2 || (overlap.length === 1 && overlapRatio >= 0.5);

  return {
    relevant,
    score: relevant ? score : 0,
    reason: relevant ? "matched" : "insufficient-context",
  };
};

const extractRequestedActionIds = (aiText) => {
  const source = String(aiText || "");
  const match = source.match(/LINK_ACTION_IDS\s*:\s*([^\r\n]+)/i);
  if (!match) return { present: false, ids: [] };

  const raw = match[1].trim();
  let values = [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) values = parsed;
    } catch (_error) {
      values = raw.replace(/[\[\]"]/g, "").split(/[|,]/);
    }
  } else {
    values = raw.split(/[|,]/);
  }

  return {
    present: true,
    ids: [...new Set(values.map((value) => String(value).trim()).filter(Boolean))],
  };
};

const stripLinkActionMetadata = (text) =>
  String(text || "")
    .replace(/\n?LINK_ACTION_IDS\s*:\s*[^\r\n]*/gi, "")
    .trim();

const toVerifiedCard = (instruction, options = {}) => {
  const action = instruction.linkAction || {};
  const validation = validateLinkAction(action, options);
  if (!validation.valid) return null;

  const type = validation.type;
  return {
    id: instructionId(instruction),
    title: String(action.title || instruction.title || "Open link").trim(),
    description: String(action.description || "").trim(),
    url: validation.url,
    type,
    ctaLabel: String(action.ctaLabel || "Open Link").trim() || "Open Link",
    openInNewTab: type === "external" ? action.openInNewTab !== false : false,
  };
};

const resolveVerifiedLinkCards = ({
  promptText,
  instructions = [],
  aiText = "",
  maxCards = 3,
  siteHosts,
} = {}) => {
  const request = extractRequestedActionIds(aiText);
  const requestedOrder = new Map(request.ids.map((id, index) => [id, index]));

  const eligible = instructions
    .filter((instruction) => instruction?.isActive !== false && instruction?.linkAction?.enabled === true)
    .filter((instruction) => !request.present || requestedOrder.has(instructionId(instruction)))
    .map((instruction) => ({
      instruction,
      relevance: scoreLinkActionRelevance(promptText, instruction),
      requestedIndex: requestedOrder.get(instructionId(instruction)),
    }))
    .filter(({ relevance }) => relevance.relevant)
    .sort((left, right) => {
      const relevanceDelta = right.relevance.score - left.relevance.score;
      if (relevanceDelta) return relevanceDelta;
      const priorityDelta = Number(right.instruction.priority || 0) - Number(left.instruction.priority || 0);
      if (priorityDelta) return priorityDelta;
      if (request.present && left.requestedIndex !== right.requestedIndex) {
        return left.requestedIndex - right.requestedIndex;
      }
      return 0;
    });

  const cards = [];
  const seenUrls = new Set();
  for (const { instruction } of eligible) {
    const card = toVerifiedCard(instruction, { siteHosts });
    if (!card || seenUrls.has(card.url)) continue;
    seenUrls.add(card.url);
    cards.push(card);
    if (cards.length >= Math.max(1, Math.min(Number(maxCards) || 3, 3))) break;
  }
  return cards;
};

module.exports = {
  DEFAULT_SITE_HOSTS,
  detectIntentFamilies,
  extractRequestedActionIds,
  normalizeText,
  isProductDetailUrl,
  resolveLinkType,
  resolveVerifiedLinkCards,
  scoreLinkActionRelevance,
  stripLinkActionMetadata,
  validateLinkAction,
};
