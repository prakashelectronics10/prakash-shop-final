const crypto = require("crypto");
const Admin = require("../models/Admin");
const NotificationEmail = require("../models/NotificationEmail");
const PulseAIUnavailableDemand = require("../models/PulseAIUnavailableDemand");
const PulseAIUnavailableDemandSettings = require("../models/PulseAIUnavailableDemandSettings");
const env = require("../config/env");
const { uploadBuffer } = require("./cloudinaryService");
const { isEmailConfigured, sendMail } = require("./mailService");
const { renderPulseAIUnavailableDemandEmail } = require("./email/templates/pulseAIUnavailableDemandTemplate");
const { logger } = require("../utils/logger");

const MAX_DEMANDS = 3;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TRACKING_HOURS = 720;
const MAX_CUSTOMER_EVENTS_PER_DEMAND = 500;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const genericDemandNames = new Set(["item", "items", "product", "products", "service", "services", "something"]);
const demandStopWords = new Set([
  "a", "about", "and", "available", "catalog", "customer", "exact", "for", "from", "hai", "hain",
  "item", "items", "ka", "ke", "ki", "ko", "me", "mein", "not", "product", "products", "service",
  "services", "shop", "store", "the", "this", "to", "unavailable", "with", "please", "show", "controlled",
  "control", "model", "new", "latest", "wala", "wali", "wale", "aur", "or", "any",
]);
const unrelatedDemandTerms = new Set([
  "shampoo", "shoe", "shoes", "sandal", "sandals", "slipper", "slippers", "firecracker", "firecrackers",
  "cracker", "crackers", "patakha", "patakhe", "cosmetic", "cosmetics", "lipstick", "makeup", "perfume",
  "food", "grocery", "groceries", "vegetable", "vegetables", "fruit", "fruits", "biscuit", "snack", "snacks",
  "clothes", "clothing", "shirt", "jeans", "dress", "saree", "soap", "medicine", "medicines", "फटाखे",
  "पटाखे", "जूता", "जूते", "शैम्पू", "साबुन", "खाना", "कपड़े", "कॉस्मेटिक्स",
]);
const electricalDomainTerms = new Set([
  "electrical", "electric", "electronic", "electronics", "accessory", "accessories", "spare", "spares", "part", "parts",
  "fan", "fans", "bldc", "cooler", "ac", "airconditioner", "refrigerator", "fridge", "freezer", "washing", "machine",
  "led", "light", "lights", "lighting", "bulb", "bulbs", "tube", "tubelight", "switch", "switches", "socket", "sockets",
  "wire", "wires", "wiring", "cable", "cables", "plug", "plugs", "extension", "mcb", "rccb", "elcb", "breaker", "db",
  "distribution", "panel", "circuit", "inverter", "battery", "batteries", "stabilizer", "charger", "adapter", "transformer",
  "capacitor", "resistor", "relay", "diode", "transistor", "pcb", "solder", "motor", "pump", "exhaust", "geyser", "heater",
  "iron", "mixer", "grinder", "induction", "microwave", "oven", "television", "tv", "speaker", "audio", "cctv", "camera",
  "mobile", "smartphone", "phone", "laptop", "computer", "monitor", "router", "wifi", "earphone", "earphones", "headphone",
  "headphones", "radio", "remote", "sensor", "module", "connector", "fuse", "drone", "solar",
  "electrician", "appliance", "appliances", "installation", "repairing", "पंखा", "बिजली", "इलेक्ट्रिक", "इलेक्ट्रॉनिक",
  "तार", "वायरिंग", "स्विच", "सॉकेट", "बल्ब", "लाइट", "कूलर", "एसी", "टीवी", "फ्रिज", "इन्वर्टर",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !demandStopWords.has(token));
}

function isBusinessRelevantDemand(demand = {}, customerMessage = "") {
  const normalized = normalizeText(`${demand.requestedItem || ""} ${customerMessage || ""}`);
  const tokens = normalized.split(" ").filter(Boolean);
  if (!tokens.length || tokens.some((token) => unrelatedDemandTerms.has(token))) return false;
  if (tokens.some((token) => electricalDomainTerms.has(token))) return true;
  return /\b(air conditioner|home appliance|spare part|wiring service|electrical service|electronics service)\b/.test(normalized)
    || /(?:घरेलू उपकरण|मरम्मत).{0,30}(?:पंखा|कूलर|एसी|टीवी|फ्रिज|बिजली|वायरिंग)/u.test(normalized);
}

function canonicalDemandKey(demand = {}) {
  const aliases = {
    fans: "fan",
    lights: "light",
    bulbs: "bulb",
    switches: "switch",
    sockets: "socket",
    wires: "wire",
    cables: "cable",
    batteries: "battery",
    accessories: "accessory",
    spares: "spare",
    parts: "part",
    repairs: "repair",
    repairing: "repair",
    services: "service",
  };
  const tokens = [...new Set(meaningfulTokens(demand.requestedItem).map((token) => aliases[token] || token))].sort();
  return `${demand.type === "service" ? "service" : "product"}:${tokens.join("-")}`.slice(0, 220);
}

function buildCustomerKey({ customerId, sessionId, requestIdentity } = {}) {
  const source = String(customerId || sessionId || requestIdentity || "anonymous").trim().slice(0, 500);
  return crypto
    .createHmac("sha256", env.jwtSecret || "pulse-ai-anonymous-demand")
    .update(source)
    .digest("hex");
}

function demandAlertDecision({ events = [], lastAlertAt, minimumUniqueCustomers, trackingPeriodHours, now = new Date() } = {}) {
  const threshold = Number(minimumUniqueCustomers || 7);
  const periodHours = Number(trackingPeriodHours || 168);
  const nowDate = new Date(now);
  const cutoff = nowDate.getTime() - periodHours * 60 * 60 * 1000;
  const eligibleEvents = events.filter((event) => new Date(event.latestDetectedAt).getTime() >= cutoff);
  const uniqueCustomerCount = new Set(eligibleEvents.map((event) => event.customerKey).filter(Boolean)).size;
  if (uniqueCustomerCount < threshold) {
    return { shouldAlert: false, uniqueCustomerCount, newUniqueCustomers: 0, eligibleEvents, reason: "below_threshold" };
  }
  if (!lastAlertAt) {
    return { shouldAlert: true, uniqueCustomerCount, newUniqueCustomers: uniqueCustomerCount, eligibleEvents, reason: "threshold_reached" };
  }

  const lastAlertTime = new Date(lastAlertAt).getTime();
  const cooldownHours = Math.min(24, periodHours);
  if (nowDate.getTime() - lastAlertTime < cooldownHours * 60 * 60 * 1000) {
    return { shouldAlert: false, uniqueCustomerCount, newUniqueCustomers: 0, eligibleEvents, reason: "cooldown" };
  }
  const newUniqueCustomers = new Set(eligibleEvents
    .filter((event) => new Date(event.firstDetectedAt).getTime() > lastAlertTime)
    .map((event) => event.customerKey)
    .filter(Boolean)).size;
  return {
    shouldAlert: newUniqueCustomers >= threshold,
    uniqueCustomerCount,
    newUniqueCustomers,
    eligibleEvents,
    reason: newUniqueCustomers >= threshold ? "new_threshold_cohort" : "already_alerted",
  };
}

function extractUnavailableDemandMetadata(aiText) {
  const source = String(aiText || "");
  const match = source.match(/UNAVAILABLE_DEMAND\s*:\s*([^\r\n]+)/i);
  if (!match) return { present: false, items: [] };

  let parsed;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch (_error) {
    return { present: true, items: [] };
  }

  const values = Array.isArray(parsed) ? parsed : [parsed];
  const items = values
    .slice(0, MAX_DEMANDS)
    .map((item) => ({
      requestedItem: String(item?.requestedItem || item?.name || "").replace(/\s+/g, " ").trim().slice(0, 160),
      type: String(item?.type || item?.requestType || "product").toLowerCase() === "service" ? "service" : "product",
      reason: String(item?.reason || "No exact active catalog match was available.").replace(/\s+/g, " ").trim().slice(0, 500),
    }))
    .filter((item) => item.requestedItem && !genericDemandNames.has(normalizeText(item.requestedItem)));

  return { present: true, items };
}

function stripUnavailableDemandMetadata(text) {
  return String(text || "")
    .replace(/\n?\s*UNAVAILABLE_DEMAND\s*:\s*[^\r\n]*/gi, "")
    .trim();
}

function responseIndicatesUnavailable(aiText, reason = "") {
  const value = normalizeText(`${stripUnavailableDemandMetadata(aiText)} ${reason}`);
  return /\b(not available|unavailable|not in (?:the )?catalog|no exact (?:catalog )?match|do not (?:currently )?have|don t (?:currently )?have|out of catalog|available nahi|stock mein nahi|catalog mein nahi)\b/.test(value)
    || /(?:उपलब्ध|मिल|स्टॉक|कैटलॉग).{0,24}(?:नहीं|नही)/u.test(value)
    || /(?:नहीं|नही).{0,24}(?:उपलब्ध|मिल|स्टॉक|कैटलॉग)/u.test(value);
}

function customerMadeDemand(customerMessage, hasImages = false) {
  if (hasImages && !String(customerMessage || "").trim()) return true;
  const value = normalizeText(customerMessage);
  if (!value) return false;
  if (/\b(what is|what are|how does|why is|explain|meaning of|kya hota|kya hai meaning)\b/.test(value)
    || /(?:क्या).{0,40}(?:होता|होती|मतलब)/u.test(value)) return false;
  return /\b(available|availability|buy|purchase|sell|stock|want|need|looking for|do you have|have any|suggest|recommend|provide|book|repair|service|chahiye|chaiye|kharid|bechte|milta|milegi|milegaa|rakhte|dikhao|dila do)\b/.test(value)
    || /\bkya\b.{0,80}\b(?:hai|hain)\b/.test(value)
    || /\b(?:hai|hain)\s+kya\b/.test(value)
    || /(?:चाहिए|खरीद|बेच|मिल|उपलब्ध|स्टॉक|मरम्मत|सर्विस|सेवा|दिखा|सुझा|पास)/u.test(value)
    || /(?:क्या).{0,80}(?:है|हैं)/u.test(value);
}

function catalogIdentity(item) {
  return normalizeText([
    item?.name,
    item?.title,
    item?.category,
    item?.categoryName,
    item?.subCategory,
    ...(item?.tags || []),
  ].filter(Boolean).join(" "));
}

function exactCatalogMatchExists(requestedItem, entries = []) {
  const requested = normalizeText(requestedItem);
  const tokens = [...new Set(meaningfulTokens(requestedItem))];
  if (!requested || !tokens.length) return false;

  return entries.some((entry) => {
    const identity = catalogIdentity(entry);
    if (!identity) return false;
    if (identity === requested || identity.includes(requested)) return true;
    return tokens.length <= 3 && tokens.every((token) => identity.split(" ").includes(token));
  });
}

function suggestionMatchesDemand(demand, suggestions = []) {
  return exactCatalogMatchExists(demand.requestedItem, suggestions.map((item) => ({
    name: item?.name,
    category: item?.category,
  })));
}

function detectUnavailableDemands({
  customerMessage,
  aiText,
  suggestions = [],
  catalogProducts = [],
  services = [],
  hasImages = false,
} = {}) {
  const metadata = extractUnavailableDemandMetadata(aiText);
  if (!metadata.present || !metadata.items.length || !customerMadeDemand(customerMessage, hasImages)) return [];

  return metadata.items.filter((demand) => {
    if (!isBusinessRelevantDemand(demand, customerMessage)) return false;
    if (!responseIndicatesUnavailable(aiText, demand.reason)) return false;
    if (suggestionMatchesDemand(demand, suggestions)) return false;

    const exactEntries = [...catalogProducts, ...services];
    if (exactCatalogMatchExists(demand.requestedItem, exactEntries)) return false;
    return true;
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function getPulseAIUnavailableAlertRecipients() {
  const [admins, manualRecipients] = await Promise.all([
    Admin.find({
      isActive: true,
      receivePulseAIUnavailableAlerts: { $ne: false },
    }).select("email").lean(),
    NotificationEmail.find({
      source: "manual",
      receivePulseAIUnavailableAlerts: true,
    }).select("email").lean(),
  ]);

  return [...new Set([
    ...admins.map((item) => normalizeEmail(item.email)),
    ...manualRecipients.map((item) => normalizeEmail(item.email)),
  ].filter(Boolean))];
}

function safeImageInputs(images = []) {
  return images.slice(0, MAX_IMAGES).reduce((safe, image, index) => {
    const mimeType = String(image?.mimeType || "image/jpeg").toLowerCase();
    if (!allowedImageTypes.has(mimeType)) return safe;
    const base64 = String(image?.base64 || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
    if (!base64) return safe;

    let buffer;
    try {
      buffer = Buffer.from(base64, "base64");
    } catch (_error) {
      return safe;
    }
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return safe;

    const extension = ({
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
      "image/gif": "gif",
    })[mimeType];
    const rawName = String(image?.name || `customer-upload-${index + 1}.${extension}`)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .slice(0, 100);
    safe.push({ buffer, mimeType, name: rawName || `customer-upload-${index + 1}.${extension}` });
    return safe;
  }, []);
}

async function prepareEmailImages(images = []) {
  const inputs = safeImageInputs(images);
  const prepared = await Promise.all(inputs.map(async (image, index) => {
    let url = "";
    try {
      const uploaded = await uploadBuffer(image.buffer, {
        folder: "pulse-ai/unavailable-demand",
        deliveryWidth: 900,
      });
      url = uploaded.secure_url || uploaded.optimized_url || "";
    } catch (error) {
      logger.warn("pulse_ai.unavailable_image_upload_failed", {
        index,
        error: error.message,
      });
    }
    return { ...image, url };
  }));

  return {
    previews: prepared.map((item) => ({ name: item.name, mimeType: item.mimeType, url: item.url })),
    attachments: prepared.map((item) => ({
      filename: item.name,
      content: item.buffer,
      contentType: item.mimeType,
    })),
  };
}

async function getPulseAIUnavailableDemandSettings() {
  return PulseAIUnavailableDemandSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default", minimumUniqueCustomers: 7, trackingPeriodHours: 168 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

function compactText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function ensureDemandDocument({ demandKey, demand, now }) {
  const update = {
    $set: {
      requestedItem: compactText(demand.requestedItem, 160),
      type: demand.type === "service" ? "service" : "product",
      reason: compactText(demand.reason, 500),
      latestDetectedAt: now,
    },
    $setOnInsert: {
      demandKey,
      firstDetectedAt: now,
      events: [],
      lastAlertUniqueCount: 0,
    },
  };
  try {
    await PulseAIUnavailableDemand.findOneAndUpdate({ demandKey }, update, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    await PulseAIUnavailableDemand.updateOne({ demandKey }, update);
  }
}

async function recordUnavailableDemand({ demand, payload, preparedImages, settings, customerKey, now }) {
  const demandKey = canonicalDemandKey(demand);
  if (!demandKey || demandKey.endsWith(":")) return null;
  await ensureDemandDocument({ demandKey, demand, now });

  const retentionCutoff = new Date(now.getTime() - MAX_TRACKING_HOURS * 60 * 60 * 1000);
  await PulseAIUnavailableDemand.updateOne(
    { demandKey },
    { $pull: { events: { latestDetectedAt: { $lt: retentionCutoff } } } },
  );

  const storedImages = preparedImages.previews
    .filter((image) => image.url)
    .slice(0, 3)
    .map((image) => ({ name: image.name, mimeType: image.mimeType, url: image.url }));
  const repeatedUpdate = {
    "events.$.latestDetectedAt": now,
    "events.$.query": compactText(payload.customerMessage, 1000) || "Image-only request",
    "events.$.aiResponse": compactText(payload.aiResponse, 1500),
  };
  if (storedImages.length) repeatedUpdate["events.$.images"] = storedImages;

  const repeated = await PulseAIUnavailableDemand.updateOne(
    { demandKey, "events.customerKey": customerKey },
    { $set: repeatedUpdate },
  );
  if (!repeated.matchedCount) {
    await PulseAIUnavailableDemand.updateOne(
      { demandKey, "events.customerKey": { $ne: customerKey } },
      {
        $push: {
          events: {
            $each: [{
              customerKey,
              query: compactText(payload.customerMessage, 1000) || "Image-only request",
              aiResponse: compactText(payload.aiResponse, 1500),
              images: storedImages,
              firstDetectedAt: now,
              latestDetectedAt: now,
            }],
            $slice: -MAX_CUSTOMER_EVENTS_PER_DEMAND,
          },
        },
      },
    );
  }

  const record = await PulseAIUnavailableDemand.findOne({ demandKey }).lean();
  if (!record) return null;
  const decision = demandAlertDecision({
    events: record.events,
    lastAlertAt: record.lastAlertAt,
    minimumUniqueCustomers: settings.minimumUniqueCustomers,
    trackingPeriodHours: settings.trackingPeriodHours,
    now,
  });
  return { record, decision };
}

async function claimDemandAlert(candidate, now) {
  const lastAlertAt = candidate.record.lastAlertAt || null;
  return PulseAIUnavailableDemand.findOneAndUpdate(
    { _id: candidate.record._id, lastAlertAt },
    {
      $set: {
        lastAlertAt: now,
        lastAlertUniqueCount: candidate.decision.uniqueCustomerCount,
      },
    },
    { new: true },
  ).lean();
}

function emailImagesFromEvents(events = []) {
  const seen = new Set();
  return [...events]
    .sort((a, b) => new Date(b.latestDetectedAt) - new Date(a.latestDetectedAt))
    .flatMap((event) => event.images || [])
    .filter((image) => {
      if (!image?.url || seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    })
    .slice(0, MAX_IMAGES);
}

async function sendAggregatedDemandEmail({ candidate, claimed, settings, payload, preparedImages, recipients, now }) {
  const recentEvents = [...candidate.decision.eligibleEvents]
    .sort((a, b) => new Date(b.latestDetectedAt) - new Date(a.latestDetectedAt));
  const firstDetectedAt = recentEvents.reduce((earliest, event) => (
    !earliest || new Date(event.firstDetectedAt) < new Date(earliest) ? event.firstDetectedAt : earliest
  ), null);
  const latestDetectedAt = recentEvents[0]?.latestDetectedAt || now;
  const images = emailImagesFromEvents(recentEvents);
  const template = renderPulseAIUnavailableDemandEmail({
    requestedItem: claimed.requestedItem,
    demandType: claimed.type,
    reason: claimed.reason,
    uniqueCustomerCount: candidate.decision.uniqueCustomerCount,
    trackingPeriodHours: settings.trackingPeriodHours,
    recentExamples: recentEvents.slice(0, 6).map((event) => ({
      query: event.query,
      detectedAt: event.latestDetectedAt,
    })),
    firstDetectedAt,
    latestDetectedAt,
    images,
    model: payload.model,
  });
  const fingerprint = crypto.createHash("sha256")
    .update(`${claimed.demandKey}:${new Date(claimed.lastAlertAt).toISOString()}`)
    .digest("hex");
  const results = await Promise.allSettled(recipients.map((recipient) => sendMail({
    to: recipient,
    subject: template.subject,
    text: template.text,
    html: template.html,
    attachments: preparedImages.attachments,
    headers: { "X-Entity-Ref-ID": `pulse-ai-demand-${fingerprint.slice(0, 24)}` },
    idempotencyKey: `pulse-ai-demand-${fingerprint}-${crypto.createHash("sha1").update(recipient).digest("hex").slice(0, 12)}`,
    tags: [
      { name: "type", value: "pulse_ai_aggregated_demand" },
      { name: "item", value: String(claimed.requestedItem || "unlisted").slice(0, 40) },
    ],
  })));

  const delivered = recipients.filter((_recipient, index) => results[index].status === "fulfilled");
  const failed = recipients.filter((_recipient, index) => results[index].status === "rejected");
  if (delivered.length) {
    await NotificationEmail.updateMany(
      { email: { $in: delivered }, source: "manual" },
      { $set: { lastDeliveryAt: now } },
    ).catch(() => undefined);
  } else {
    await PulseAIUnavailableDemand.updateOne(
      { _id: claimed._id, lastAlertAt: claimed.lastAlertAt },
      { $set: { lastAlertAt: candidate.record.lastAlertAt || null, lastAlertUniqueCount: candidate.record.lastAlertUniqueCount || 0 } },
    ).catch(() => undefined);
  }

  logger.info("pulse_ai.aggregated_demand_alert_finished", {
    demandKey: claimed.demandKey,
    uniqueCustomers: candidate.decision.uniqueCustomerCount,
    delivered: delivered.length,
    failed: failed.length,
    recipients: recipients.length,
  });
}

async function processUnavailableDemandTracking(payload) {
  const demands = (payload.demands || []).filter((demand) => isBusinessRelevantDemand(demand, payload.customerMessage));
  if (!demands.length) return;
  const [settings, preparedImages] = await Promise.all([
    getPulseAIUnavailableDemandSettings(),
    prepareEmailImages(payload.images),
  ]);
  const now = payload.createdAt ? new Date(payload.createdAt) : new Date();
  const customerKey = buildCustomerKey(payload);
  const candidates = (await Promise.all(demands.map((demand) => recordUnavailableDemand({
    demand,
    payload,
    preparedImages,
    settings,
    customerKey,
    now,
  })))).filter((candidate) => candidate?.decision.shouldAlert);
  if (!candidates.length) return;

  if (!isEmailConfigured()) {
    logger.warn("pulse_ai.aggregated_demand_email_not_configured", { candidates: candidates.length });
    return;
  }
  const recipients = await getPulseAIUnavailableAlertRecipients();
  if (!recipients.length) {
    logger.info("pulse_ai.aggregated_demand_no_recipients", { candidates: candidates.length });
    return;
  }

  for (const candidate of candidates) {
    const claimed = await claimDemandAlert(candidate, now);
    if (!claimed) continue;
    await sendAggregatedDemandEmail({ candidate, claimed, settings, payload, preparedImages, recipients, now });
  }
}

function enqueuePulseAIUnavailableDemandAlert(payload = {}) {
  if (!Array.isArray(payload.demands) || !payload.demands.length) return { queued: false, reason: "no_demands" };
  if (!payload.demands.some((demand) => isBusinessRelevantDemand(demand, payload.customerMessage))) {
    return { queued: false, reason: "outside_business_domain" };
  }
  setImmediate(() => {
    processUnavailableDemandTracking(payload).catch((error) => {
      logger.error("pulse_ai.unavailable_demand_tracking_failed", { error: error.message });
    });
  });
  return { queued: true, tracking: true };
}

module.exports = {
  customerMadeDemand,
  buildCustomerKey,
  canonicalDemandKey,
  demandAlertDecision,
  detectUnavailableDemands,
  enqueuePulseAIUnavailableDemandAlert,
  exactCatalogMatchExists,
  extractUnavailableDemandMetadata,
  getPulseAIUnavailableAlertRecipients,
  getPulseAIUnavailableDemandSettings,
  isBusinessRelevantDemand,
  responseIndicatesUnavailable,
  safeImageInputs,
  stripUnavailableDemandMetadata,
};
