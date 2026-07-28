/**
 * Intent-strict catalog matching for Pulse AI suggestions.
 * Only products that match the customer's demand (type/color/keywords) are ranked.
 */

const COLOR_WORDS = [
  "red", "blue", "white", "black", "green", "yellow", "pink", "gold", "golden",
  "silver", "grey", "gray", "orange", "purple", "brown", "beige", "transparent",
  "multicolor", "rgb", "cyan", "navy", "maroon",
];

const PRODUCT_FAMILIES = [
  { id: "cooling", keys: ["cooling", "cooler", "cool", "fan", "spray fan", "air cooler", "blower", "portable cooler", "mini cooler"] },
  { id: "lighting", keys: ["led", "light", "lamp", "bulb", "strip", "rgb", "rope", "torch", "flashlight"] },
  { id: "audio", keys: ["speaker", "mic", "microphone", "amplifier", "bluetooth", "audio"] },
  { id: "wiring", keys: ["wire", "cable", "mcb", "switch", "socket", "plug", "board"] },
  { id: "motor", keys: ["motor", "servo", "driver"] },
  { id: "sensor", keys: ["sensor", "ultrasonic", "ir", "module", "arduino", "relay"] },
  { id: "power", keys: ["battery", "adapter", "charger", "stabilizer", "solar"] },
  { id: "appliance-ac", keys: ["air conditioner", "split ac", "ac repair", "ac gas"] },
];

const projectComponentMap = [
  { keys: ["water level", "water indicator", "tank"], items: ["water level sensor", "buzzer", "led", "resistor", "transistor", "battery", "jumper wire"] },
  { keys: ["rain alarm", "rain detector", "rain sensor"], items: ["rain sensor", "buzzer", "led", "resistor", "transistor", "battery"] },
  { keys: ["smart dustbin", "dustbin"], items: ["ultrasonic sensor", "servo motor", "arduino", "jumper wire", "battery", "switch"] },
  { keys: ["arduino", "aurdino", "robot", "automation", "iot", "internet of things"], items: ["arduino", "breadboard", "jumper wire", "sensor module", "relay module", "battery"] },
  { keys: ["line follower"], items: ["ir sensor", "motor driver", "dc motor", "wheel", "arduino", "battery"] },
  { keys: ["fire alarm", "smoke"], items: ["flame sensor", "smoke sensor", "buzzer", "led", "resistor", "battery"] },
  { keys: ["soil", "plant", "irrigation"], items: ["soil moisture sensor", "relay module", "water pump", "arduino", "jumper wire"] },
  { keys: ["wiring", "wire", "cable", "electrical wire"], items: ["electrical wire", "copper wire", "flexible wire", "cable", "insulation tape"] },
  { keys: ["mcb", "switch", "socket", "plug", "board"], items: ["mcb", "switch", "socket", "plug", "distribution board"] },
  { keys: ["rgb", "led strip", "led light", "decorative light", "rope light"], items: ["rgb light", "led strip", "led bulb", "led rope", "controller", "adapter"] },
  { keys: ["cooling", "cool product", "cooler", "desert cooler", "air cooler", "portable cooler"], items: ["cooler", "cooling", "fan", "spray fan", "air cooler", "portable cooler", "mini cooler"] },
  { keys: ["ac", "air conditioner", "split ac"], items: ["ac remote", "ac capacitor", "ac gas service", "ac stabilizer"] },
  { keys: ["fan", "ceiling fan", "table fan", "pedestal fan", "spray fan", "blower"], items: ["fan", "ceiling fan", "table fan", "spray fan", "cooler", "cooling"] },
  { keys: ["tv", "led tv", "lcd tv"], items: ["tv remote", "hdmi cable", "tv board", "power adapter"] },
  { keys: ["speaker", "home theater", "bluetooth speaker", "mic", "microphone"], items: ["speaker", "bluetooth speaker", "microphone", "amplifier", "aux cable"] },
  { keys: ["torch", "flashlight", "lamp", "solar lamp", "emergency light"], items: ["torch", "flashlight", "lamp", "solar lamp", "emergency light"] },
  { keys: ["motor", "synchronous motor", "dc motor"], items: ["motor", "synchronous motor", "dc motor", "servo motor"] },
];

const matchStopWords = new Set([
  "and", "the", "for", "with", "from", "this", "that", "your", "you", "are", "can",
  "please", "project", "science", "component", "components", "product", "products",
  "available", "availability", "shop", "electronics", "electrical", "repair", "image",
  "photo", "picture", "shown", "visible", "required", "suggested", "basic", "using",
  "want", "only", "need", "have", "show", "give", "some", "best", "related", "about",
  "looking", "buy", "sale", "price", "rupees", "rs",
]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\baurdino\b/g, "arduino")
    .replace(/\biot\b/g, "internet of things")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function meaningfulWords(value) {
  return normalize(value)
    .split(" ")
    .filter((word) => word && !matchStopWords.has(word) && (word.length >= 3 || /\d/.test(word)));
}

function containsPhrase(haystack, phrase) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase || normalizedPhrase.length < 3) return false;
  return new RegExp(`(^| )${normalizedPhrase.replace(/\s+/g, " ")}( |$)`).test(haystack);
}

function extractColors(text) {
  const normalized = normalize(text);
  return COLOR_WORDS.filter((color) => containsPhrase(normalized, color));
}

function detectFamilies(text) {
  const normalized = normalize(text);
  return PRODUCT_FAMILIES
    .filter((family) => family.keys.some((key) => {
      const phrase = normalize(key);
      if (!phrase) return false;
      // Short keys must be whole words — "cool" must not match inside "bluetooth"
      if (phrase.length <= 4) return containsPhrase(normalized, phrase);
      return containsPhrase(normalized, phrase) || normalized.includes(phrase);
    }))
    .map((family) => family.id);
}

function extractWantedComponents(text) {
  const normalized = normalize(text);
  const wanted = [];

  projectComponentMap.forEach((entry) => {
    if (entry.keys.some((key) => normalized.includes(key))) {
      wanted.push(...entry.items);
    }
  });

  [
    "arduino", "breadboard", "jumper wire", "buzzer", "led", "resistor", "transistor",
    "sensor", "motor", "servo", "relay", "battery", "switch", "diode", "capacitor",
    "ultrasonic", "ir sensor", "water sensor", "rain sensor", "dc motor", "motor driver",
    "water pump", "flame sensor", "smoke sensor", "soil moisture sensor",
    "mcb", "socket", "plug", "wire", "cable", "rgb", "led strip", "cooler", "cooling",
    "fan", "spray fan", "portable cooler", "speaker", "microphone", "torch", "lamp",
  ].forEach((item) => {
    if (normalized.includes(item)) wanted.push(item);
  });

  return unique(wanted).slice(0, 12);
}

function extractUserIntent(promptText) {
  const normalized = normalize(promptText);
  const keywords = meaningfulWords(normalized).slice(0, 16);
  const colors = extractColors(normalized);
  const families = detectFamilies(normalized);
  const wantedComponents = extractWantedComponents(normalized);
  return {
    raw: normalized,
    keywords,
    colors,
    families,
    wantedComponents,
    hasSpecificDemand: Boolean(families.length || wantedComponents.length || colors.length || keywords.length >= 2),
  };
}

function productSearchText(product) {
  return normalize([
    product.name,
    product.shortDescription,
    product.description,
    product.category,
    product.subCategory,
    product.imageUrl,
    ...(product.tags || []),
    ...(product.specifications || []).map((item) => `${item.label || ""} ${item.value || ""}`),
    ...(product.images || []).map((item) => `${item.url || ""} ${item.alt || ""}`),
  ].join(" "));
}

/** Name / category / tags only — ignore description so "used in cooler" does not reclassify a motor. */
function productIdentityText(product) {
  return normalize([
    product.name,
    product.category,
    product.subCategory,
    ...(product.tags || []),
  ].join(" "));
}

const SPARE_PART_KEYS = [
  "motor", "synchronous motor", "dc motor", "servo", "capacitor", "pump",
  "regulator", "blade", "pad", "bearing", "winding", "spare", "relay",
  "module", "sensor", "driver", "resistor", "transistor", "diode", "ic",
];

const RETAIL_COOLING_KEYS = [
  "cooler", "cooling", "fan", "blower", "air cooler", "spray fan",
  "portable cooler", "mini cooler", "table fan", "ceiling fan", "pedestal fan",
  "desk fan", "usb fan",
];

function wantsSpareParts(intent) {
  const raw = intent?.raw || "";
  return ["motor", "capacitor", "spare", "part", "parts", "pump", "regulator", "blade", "pad", "repair part", "component"]
    .some((key) => containsPhrase(raw, key));
}

function isSpareOrComponentProduct(product) {
  const identity = productIdentityText(product);
  return SPARE_PART_KEYS.some((key) => containsPhrase(identity, key));
}

function isRetailCoolingProduct(product) {
  const identity = productIdentityText(product);
  if (!RETAIL_COOLING_KEYS.some((key) => containsPhrase(identity, key))) return false;
  // "fan capacitor" / "cooler motor" are spare parts, not cooling products
  if (isSpareOrComponentProduct(product)) return false;
  return true;
}

function productFamilyIds(product) {
  // Prefer identity (name/category/tags) so description mentions of "cooler" don't make a motor a cooling product
  const primary = detectFamilies(productIdentityText(product));
  if (primary.length) return primary;
  return detectFamilies(productSearchText(product));
}

function expandComponentTerms(component) {
  const normalized = normalize(component);
  const aliases = {
    arduino: ["arduino", "uno", "nano", "microcontroller"],
    "jumper wire": ["jumper wire", "jumper cable", "male female wire", "dupont wire"],
    led: ["led", "light emitting diode"],
    fan: ["fan", "ceiling fan", "table fan", "spray fan", "cooling fan"],
    cooler: ["cooler", "air cooler", "portable cooler", "mini cooler", "desert cooler"],
    cooling: ["cooling", "cooler", "fan", "spray fan", "air cooler", "portable cooler"],
    speaker: ["speaker", "bluetooth speaker", "boombox"],
    "ir sensor": ["ir sensor", "infrared sensor", "line sensor"],
    ultrasonic: ["ultrasonic", "hc sr04", "distance sensor"],
    "ultrasonic sensor": ["ultrasonic sensor", "hc sr04", "distance sensor"],
    "rain sensor": ["rain sensor", "rain detector", "water drop sensor"],
    "water sensor": ["water sensor", "water level sensor", "level sensor"],
    "water level sensor": ["water level sensor", "water sensor", "level sensor"],
    "soil moisture sensor": ["soil moisture sensor", "soil sensor", "moisture sensor"],
    "relay module": ["relay module", "relay"],
    "servo motor": ["servo motor", "servo", "sg90"],
    "dc motor": ["dc motor", "motor"],
    "motor driver": ["motor driver", "l298n", "l293d"],
    battery: ["battery", "cell", "power supply"],
  };
  return unique([normalized, ...(aliases[normalized] || [])].map(normalize));
}

function scoreProduct(product, component) {
  const normalizedHaystack = productSearchText(product);
  const componentTerms = expandComponentTerms(component);
  const productWords = new Set(normalizedHaystack.split(" ").filter(Boolean));
  let bestScore = 0;

  componentTerms.forEach((term) => {
    const componentWords = term.split(" ").filter(Boolean);
    const exactPhrase = new RegExp(`(^| )${term.replace(/\s+/g, " ")}( |$)`).test(normalizedHaystack);
    const wordScore = componentWords.reduce((score, word) => score + (productWords.has(word) ? 1 : 0), 0);
    const score = (exactPhrase ? 5 : 0) + wordScore;
    bestScore = Math.max(bestScore, score);
  });

  return bestScore;
}

function extractModelTokens(value) {
  return unique(
    normalize(value)
      .split(" ")
      .filter((word) => word.length >= 2 && /[a-z]/.test(word) && /\d/.test(word)),
  );
}

function scoreProductForUserIntent(product, intent) {
  if (!intent?.hasSpecificDemand) return 0;

  const productText = productSearchText(product);
  const productName = normalize(product.name);
  const identityText = productIdentityText(product);
  const productWords = new Set(meaningfulWords(productText));
  const nameWords = meaningfulWords(productName);
  const families = productFamilyIds(product);

  // "cooling products" / fan / cooler → finished appliances only (not motors used inside coolers)
  if (intent.families.includes("cooling") && !wantsSpareParts(intent)) {
    if (!isRetailCoolingProduct(product)) return 0;
  }

  let score = 0;
  let familyHit = false;
  let componentHit = false;
  let keywordHitCount = 0;

  if (intent.families.length) {
    const overlap = intent.families.filter((family) => families.includes(family));
    if (!overlap.length) return 0;
    familyHit = true;
    score += overlap.length * 18;
  }

  // Stronger weight when name/category/tags match (not only description)
  if (intent.families.includes("cooling") && isRetailCoolingProduct(product)) {
    score += 20;
  }
  if (intent.keywords.some((word) => containsPhrase(identityText, word) || nameWords.includes(word))) {
    score += 10;
  }

  intent.wantedComponents.forEach((component) => {
    const componentScore = scoreProduct(product, component);
    if (componentScore >= 2) {
      componentHit = true;
      score += componentScore * 6;
    }
  });

  intent.keywords.forEach((word) => {
    if (productWords.has(word) || nameWords.includes(word) || containsPhrase(productText, word)) {
      keywordHitCount += 1;
      score += nameWords.includes(word) ? 8 : 3;
    }
  });

  if (intent.colors.length) {
    const productColors = extractColors(productText);
    const colorHits = intent.colors.filter((color) => productColors.includes(color) || containsPhrase(productText, color));
    if (!colorHits.length) return 0;
    score += colorHits.length * 16;
  }

  const modelMatches = extractModelTokens(productText).filter((token) => containsPhrase(intent.raw, token));
  score += modelMatches.length * 12;

  if (containsPhrase(intent.raw, productName)) score += 40;

  const relevanceOk =
    familyHit
    || componentHit
    || modelMatches.length > 0
    || containsPhrase(intent.raw, productName)
    || (keywordHitCount >= 2 && score >= 10)
    || (intent.keywords.length <= 2 && keywordHitCount >= 1 && score >= 8);

  return relevanceOk && score > 0 ? score : 0;
}

function extractCatalogMatchesFromAi(aiText, products) {
  const match = String(aiText || "").match(/CATALOG_MATCHES\s*:\s*(.+)$/im);
  if (!match) return [];
  const names = match[1]
    .split("|")
    .map((item) => normalize(item))
    .filter((item) => item.length >= 3);

  return (products || [])
    .map((product) => {
      const productName = normalize(product.name);
      const hit = names.find((name) => productName === name || productName.includes(name) || name.includes(productName));
      return hit ? { product, score: 120 + (productName === hit ? 25 : 0), component: "Exact demand match" } : null;
    })
    .filter(Boolean);
}

function extractImageFindings(aiText) {
  const match = String(aiText || "").match(/IMAGE_FINDINGS\s*:\s*(.+)$/im);
  if (!match) {
    return { raw: "", type: "", colors: [], labels: [], shape: "", keywords: [] };
  }
  const raw = match[1].trim();
  const get = (key) => {
    const found = raw.match(new RegExp(`${key}\\s*=\\s*([^;]+)`, "i"));
    return found ? found[1].trim() : "";
  };
  const type = get("type");
  const shape = get("shape");
  const colors = unique(
    `${get("colors")} ${get("color")}`
      .split(/[,\s]+/)
      .map((item) => normalize(item))
      .filter((item) => COLOR_WORDS.includes(item)),
  );
  const labels = unique(
    get("labels")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  );
  const keywords = unique(
    `${get("keywords")} ${type} ${shape}`
      .split(/[,\s]+/)
      .map((item) => normalize(item))
      .filter((item) => item.length >= 3),
  );
  return { raw, type, colors, labels, shape, keywords };
}

function mergeIntents(primary, secondary) {
  const families = primary.families.length ? primary.families : secondary.families;
  const colors = primary.colors.length ? primary.colors : secondary.colors;
  const wantedComponents = unique([...(primary.wantedComponents || []), ...(secondary.wantedComponents || [])]).slice(0, 12);
  const keywords = unique([...(primary.keywords || []), ...(secondary.keywords || [])]).slice(0, 16);
  const raw = unique([primary.raw, secondary.raw].filter(Boolean)).join(" ");
  return {
    raw,
    keywords,
    colors,
    families,
    wantedComponents,
    hasSpecificDemand: Boolean(families.length || wantedComponents.length || colors.length || keywords.length >= 2),
  };
}

function buildDemandIntent(promptText, aiText, hasImages = false) {
  const promptIntent = extractUserIntent(promptText);
  if (!hasImages) return promptIntent;

  const findings = extractImageFindings(aiText);
  const findingsBlob = [
    findings.type,
    findings.colors.join(" "),
    findings.labels.join(" "),
    findings.shape,
    findings.keywords.join(" "),
    findings.raw,
  ].filter(Boolean).join(" ");

  const aiBody = stripAiMetaLines(aiText).slice(0, 700);
  const visualIntent = extractUserIntent([findingsBlob, aiBody].filter(Boolean).join(" "));

  // Prefer explicit IMAGE_FINDINGS colors when prompt has none
  if (!promptIntent.colors.length && findings.colors.length) {
    visualIntent.colors = unique([...visualIntent.colors, ...findings.colors]);
  }

  return mergeIntents(promptIntent, visualIntent);
}

function scoreProductAgainstImageFindings(product, findings) {
  if (!findings?.raw && !findings?.type && !(findings?.keywords || []).length) return 0;

  const identity = productIdentityText(product);
  const fullText = productSearchText(product);
  const name = normalize(product.name);
  let score = 0;

  if (findings.type) {
    const typeNorm = normalize(findings.type);
    if (containsPhrase(name, typeNorm) || name.includes(typeNorm) || typeNorm.includes(name)) score += 35;
    else if (containsPhrase(identity, typeNorm) || identity.includes(typeNorm)) score += 22;
    else if (fullText.includes(typeNorm)) score += 8;
  }

  (findings.keywords || []).forEach((word) => {
    if (containsPhrase(name, word) || name.includes(word)) score += 10;
    else if (containsPhrase(identity, word)) score += 6;
    else if (containsPhrase(fullText, word)) score += 2;
  });

  (findings.labels || []).forEach((label) => {
    const labelNorm = normalize(label);
    if (!labelNorm) return;
    if (fullText.includes(labelNorm) || name.includes(labelNorm)) score += 28;
  });

  (findings.colors || []).forEach((color) => {
    if (containsPhrase(fullText, color) || extractColors(fullText).includes(color)) score += 14;
  });

  if (findings.shape) {
    const shapeWords = meaningfulWords(findings.shape);
    shapeWords.forEach((word) => {
      if (containsPhrase(fullText, word)) score += 3;
    });
  }

  return score;
}

function stripAiMetaLines(text) {
  return String(text || "")
    .replace(/\n?\s*CATALOG_MATCHES\s*:.*$/gim, "")
    .replace(/\n?\s*IMAGE_FINDINGS\s*:.*$/gim, "")
    .trim();
}

function stripCatalogMatchLine(text) {
  return stripAiMetaLines(text);
}

function formatProductMemoryLine(product) {
  const colors = extractColors(productSearchText(product));
  const tags = (product.tags || []).slice(0, 6).join(", ");
  const desc = String(product.shortDescription || product.description || "").replace(/\s+/g, " ").trim().slice(0, 90);
  const price = product.price === null || product.price === undefined || product.price === ""
    ? "Price on request"
    : `Rs.${Number(product.price).toLocaleString("en-IN")}`;
  const lookBits = unique([
    ...colors,
    ...RETAIL_COOLING_KEYS.filter((key) => containsPhrase(productIdentityText(product), key)),
    ...(product.tags || []).slice(0, 4).map((tag) => normalize(tag)),
  ]).slice(0, 8).join(",");
  return `- ${product.name} | cat:${product.category || "General"}${product.subCategory ? `/${product.subCategory}` : ""} | ${product.availability || "In Stock"} | ${price}${colors.length ? ` | colors:${colors.join(",")}` : ""}${lookBits ? ` | look:${lookBits}` : ""}${tags ? ` | tags:${tags}` : ""}${desc ? ` | desc:${desc}` : ""}`;
}

function rankProductsForDemand(promptText, aiText, products, deepSearch = false, options = {}) {
  const hasImages = Boolean(options.hasImages);
  const intent = buildDemandIntent(promptText, aiText, hasImages);
  const findings = hasImages ? extractImageFindings(aiText) : null;
  const catalogHits = extractCatalogMatchesFromAi(aiText, products);
  const used = new Set();
  const candidates = [];

  catalogHits.forEach((item) => {
    const id = String(item.product._id);
    if (used.has(id)) return;
    // Require intent fit when user/image demand is clear
    if (intent.families.length || intent.colors.length) {
      const intentScore = scoreProductForUserIntent(item.product, intent);
      if (intentScore <= 0) return;
      item.score += intentScore;
    }
    if (hasImages) {
      item.score += 45 + scoreProductAgainstImageFindings(item.product, findings);
      item.component = "Image match";
    }
    used.add(id);
    candidates.push(item);
  });

  (products || []).forEach((product) => {
    const id = String(product._id);
    if (used.has(id)) return;

    let score = scoreProductForUserIntent(product, intent);
    if (hasImages) {
      const imageScore = scoreProductAgainstImageFindings(product, findings);
      if (imageScore >= 18) score += imageScore;
    }
    if (score <= 0) return;

    used.add(id);
    candidates.push({
      product,
      score,
      component: hasImages && scoreProductAgainstImageFindings(product, findings) >= 18
        ? "Image match"
        : intent.colors.length
          ? `Color match: ${intent.colors.join(", ")}`
          : intent.families[0] || intent.wantedComponents[0] || "Demand match",
    });
  });

  const limit = deepSearch ? 10 : 6;
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  normalize,
  extractWantedComponents,
  extractUserIntent,
  extractImageFindings,
  productSearchText,
  extractColors,
  stripCatalogMatchLine,
  stripAiMetaLines,
  formatProductMemoryLine,
  rankProductsForDemand,
  isRetailCoolingProduct,
};
