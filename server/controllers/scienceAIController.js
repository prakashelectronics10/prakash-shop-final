const catchAsync = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const ProjectPart = require("../models/ProjectPart");
const ShopProduct = require("../models/ShopProduct");
const { availableStockQuantity } = require("../utils/inventory");
const { getSitePayload } = require("../services/siteService");

const GEMINI_COOLDOWN_MS = 65 * 1000;
let geminiCooldownUntil = 0;
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

const projectComponentMap = [
  { keys: ["water level", "water indicator", "tank"], items: ["water level sensor", "buzzer", "led", "resistor", "transistor", "battery", "jumper wire"] },
  { keys: ["rain alarm", "rain detector", "rain sensor"], items: ["rain sensor", "buzzer", "led", "resistor", "transistor", "battery"] },
  { keys: ["smart dustbin", "dustbin"], items: ["ultrasonic sensor", "servo motor", "arduino", "jumper wire", "battery", "switch"] },
  { keys: ["arduino", "aurdino", "robot", "automation", "iot", "internet of things"], items: ["arduino", "breadboard", "jumper wire", "sensor module", "relay module", "battery"] },
  { keys: ["line follower", "car"], items: ["ir sensor", "motor driver", "dc motor", "wheel", "arduino", "battery"] },
  { keys: ["fire alarm", "smoke"], items: ["flame sensor", "smoke sensor", "buzzer", "led", "resistor", "battery"] },
  { keys: ["soil", "plant", "irrigation"], items: ["soil moisture sensor", "relay module", "water pump", "arduino", "jumper wire"] },
  { keys: ["wiring", "wire", "cable", "electrical wire"], items: ["electrical wire", "copper wire", "flexible wire", "cable", "insulation tape"] },
  { keys: ["mcb", "switch", "socket", "plug", "board"], items: ["mcb", "switch", "socket", "plug", "distribution board"] },
  { keys: ["rgb", "led strip", "led light", "decorative light"], items: ["rgb light", "led strip", "led bulb", "controller", "adapter"] },
  { keys: ["cooler", "desert cooler", "air cooler"], items: ["cooler motor", "cooler pump", "cooler pad", "cooler switch"] },
  { keys: ["ac", "air conditioner", "split ac"], items: ["ac remote", "ac capacitor", "ac gas service", "ac stabilizer"] },
  { keys: ["fan", "ceiling fan", "table fan"], items: ["fan capacitor", "fan regulator", "fan motor", "fan blade"] },
  { keys: ["tv", "led tv", "lcd tv"], items: ["tv remote", "hdmi cable", "tv board", "power adapter"] },
  { keys: ["speaker", "home theater", "bluetooth speaker"], items: ["speaker", "amplifier", "aux cable", "bluetooth module"] },
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\baurdino\b/g, "arduino")
    .replace(/\biot\b/g, "internet of things")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

const availableStatuses = new Set(["in stock", "low stock", "available", "available now"]);
const matchStopWords = new Set([
  "and", "the", "for", "with", "from", "this", "that", "your", "you", "are", "can",
  "please", "project", "science", "component", "components", "product", "products",
  "available", "availability", "shop", "electronics", "electrical", "repair", "image",
  "photo", "picture", "shown", "visible", "required", "suggested", "basic", "using",
]);

function isProductAvailable(product) {
  const availability = normalize(product.availability || "In Stock");
  if (availability.includes("out of stock") || availability.includes("not available") || availability.includes("unavailable")) {
    return false;
  }
  return availableStatuses.has(availability) || availability.includes("stock") || availability.includes("available");
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
    "mcb", "socket", "plug", "wire", "cable", "rgb", "led strip", "cooler pump",
    "fan capacitor", "stabilizer", "hdmi", "speaker",
  ].forEach((item) => {
    if (normalized.includes(item)) wanted.push(item);
  });

  return unique(wanted).slice(0, 10);
}

function productSearchText(product) {
  return normalize([
    product.name,
    product.shortDescription,
    product.description,
    product.category,
    product.imageUrl,
    ...(product.tags || []),
    ...(product.specifications || []).map((item) => `${item.label || ""} ${item.value || ""}`),
    ...(product.images || []).map((item) => `${item.url || ""} ${item.alt || ""}`),
  ].join(" "));
}

function expandComponentTerms(component) {
  const normalized = normalize(component);
  const aliases = {
    arduino: ["arduino", "uno", "nano", "microcontroller"],
    "jumper wire": ["jumper wire", "jumper cable", "male female wire", "dupont wire"],
    led: ["led", "light emitting diode"],
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

function meaningfulWords(value) {
  return normalize(value)
    .split(" ")
    .filter((word) => word && !matchStopWords.has(word) && (word.length >= 3 || /\d/.test(word)));
}

function extractModelTokens(value) {
  return unique(
    normalize(value)
      .split(" ")
      .filter((word) => word.length >= 2 && /[a-z]/.test(word) && /\d/.test(word)),
  );
}

function containsPhrase(haystack, phrase) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase || normalizedPhrase.length < 3) return false;
  return new RegExp(`(^| )${normalizedPhrase.replace(/\s+/g, " ")}( |$)`).test(haystack);
}

function scoreProductAgainstContext(product, context) {
  const normalizedContext = normalize(context);
  if (!normalizedContext) return 0;

  const productName = normalize(product.name);
  const productText = productSearchText(product);
  const contextWords = new Set(meaningfulWords(normalizedContext));
  const nameWords = meaningfulWords(productName);
  const productWords = meaningfulWords(productText);
  const matchedNameWords = nameWords.filter((word) => contextWords.has(word));
  const matchedProductWords = productWords.filter((word) => contextWords.has(word));
  const modelMatches = extractModelTokens(productText).filter((token) => containsPhrase(normalizedContext, token));
  const exactNameMatch = containsPhrase(normalizedContext, productName);
  const nameRatio = nameWords.length ? matchedNameWords.length / nameWords.length : 0;

  let score = 0;
  if (exactNameMatch) score += 22;
  score += matchedNameWords.length * 5;
  if (matchedNameWords.length && nameRatio >= 0.6) score += 10;
  score += Math.min(matchedProductWords.length, 5);
  score += modelMatches.length * 10;

  const strongMatch =
    exactNameMatch ||
    modelMatches.length > 0 ||
    (matchedNameWords.length >= Math.min(2, nameWords.length || 2) && nameRatio >= 0.5) ||
    score >= 12;

  return strongMatch ? score : 0;
}

async function fetchAvailableCatalogProducts() {
  if (ShopProduct.db.readyState !== 1 && ProjectPart.db.readyState !== 1) {
    return [];
  }

  const [shopProducts, projectParts] = await Promise.all([
    ShopProduct.find({ isActive: true, availability: { $in: ["In Stock", "Low Stock"] } })
      .sort({ displayOrder: 1, name: 1 })
      .limit(300)
      .lean(),
    ProjectPart.find({ isActive: true, availability: { $in: ["In Stock", "Low Stock"] } })
      .sort({ displayOrder: 1, name: 1 })
      .limit(300)
      .lean(),
  ]);

  return [
    ...shopProducts.map((product) => ({ ...product, sourceCollection: "shop-products" })),
    ...projectParts.map((product) => ({ ...product, sourceCollection: "project-parts" })),
  ].filter(isProductAvailable);
}

function formatCatalogForGemini(products, deepSearch = false) {
  const catalog = (products || [])
    .slice(0, deepSearch ? 200 : 120)
    .map((product) => {
      const tags = (product.tags || []).slice(0, 5).join(", ");
      return `- ${product.name} | ${product.category || "Component"} | ${product.availability || "In Stock"}${tags ? ` | tags: ${tags}` : ""}`;
    })
    .join("\n");

  if (!catalog) return "No verified available product catalog is loaded right now.";
  return `Verified available product catalog. Only use these names for shop/product availability; do not invent availability:\n${catalog}`;
}

async function formatWebsiteKnowledgeForGemini() {
  try {
    const site = await getSitePayload();
    const services = (site.products || [])
      .slice(0, 40)
      .map((item) => `- Service/card: ${item.title || item.name || "Untitled"} | ${item.categoryName || item.category || "Services"} | ${(item.shortDescription || item.description || "").slice(0, 120)}`)
      .join("\n");
    const offers = (site.offers || [])
      .slice(0, 20)
      .map((item) => `- Offer/update: ${item.title || "Offer"} | ${(item.description || "").slice(0, 120)}${item.code ? ` | code: ${item.code}` : ""}`)
      .join("\n");
    const about = ((site.content && site.content.about && site.content.about.reasons) || [])
      .slice(0, 12)
      .map((item) => `- About: ${item.title || item.heading || "About point"} | ${(item.description || item.desc || "").slice(0, 120)}`)
      .join("\n");
    const contact = site.contact
      ? `Contact: phone ${site.contact.phone || site.contact.whatsapp || "n/a"} | email ${site.contact.email || "n/a"} | address ${site.contact.address || site.contact.location || "Chitarpur"}`
      : "Contact: Prakash Electronics and Electricals, Chitarpur";

    return [
      "Live website knowledge for Prakash Electronics and Electricals (use this to guide customers politely):",
      contact,
      "Key pages: / (home), /products, /wiring-parts, /booking, /pulse-ai (Pulse AI), /cart, /learn-more",
      "Capabilities: electronics shop, wiring accessories, RGB lights, home appliances repairing, cooler repairing, AC repairing, fan/TV/speaker repair, bookings, offers/recent updates, about, gallery, testimonials.",
      services ? `Services / repair cards:\n${services}` : "Services / repair cards: not loaded",
      offers ? `Recent updates / offers:\n${offers}` : "Recent updates / offers: none loaded",
      about ? `About highlights:\n${about}` : "About highlights: not loaded",
    ].join("\n");
  } catch (_error) {
    return "Website knowledge is temporarily unavailable. Still help with electronics products, repairs, wiring accessories, and booking guidance.";
  }
}

function suggestionFromProduct(product, component) {
  return {
    component,
    available: true,
    status: product.availability === "Low Stock" ? "Low Stock" : "Available Now",
    productId: String(product._id),
    slug: product.slug,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl || product.images?.find((image) => image.url)?.url || "",
    shortDescription: product.shortDescription || product.description || "Available shop product from Prakash Electronics.",
    availability: product.availability || "In Stock",
    quantity: product.quantity ?? product.stock ?? 1,
    stockQuantity: availableStockQuantity(product, product.sourceCollection === "project-parts" ? "stock" : "quantity"),
    category: product.category || "Components",
    sourceCollection: product.sourceCollection,
  };
}

function getCooldownSeconds() {
  return Math.max(1, Math.ceil((geminiCooldownUntil - Date.now()) / 1000));
}

function buildLocalResponse(promptText, imageCount = 0, reason = "") {
  const normalizedPrompt = String(promptText || "").toLowerCase();
  const components = extractWantedComponents(promptText);
  const list = components.length
    ? components.map((item) => `- ${item}`).join("\n")
    : "- Arduino or controller board\n- Sensor/module according to project\n- Breadboard\n- Jumper wires\n- Battery/power supply\n- LEDs/resistors for testing";
  const note = reason
    ? "\n\nNote: Gemini API se abhi direct response nahi aa paya, isliye maine local fallback guidance aur shop suggestions generate kiye hain."
    : "";

  const serviceContext = normalizedPrompt.includes("repair") || normalizedPrompt.includes("ac") || normalizedPrompt.includes("cooler") || normalizedPrompt.includes("fan")
    ? "\n\nIf the user is asking for repair support, first identify the appliance type, visible fault, and whether it needs diagnosis, spare part replacement, or booking support."
    : "";

  const productContext = normalizedPrompt.includes("wire") || normalizedPrompt.includes("accessory") || normalizedPrompt.includes("rgb") || normalizedPrompt.includes("switch") || normalizedPrompt.includes("mcb")
    ? "\n\nIf the user is asking for product selection, recommend the most suitable wiring accessory, switch, LED/RGB lighting item, or compatible electrical part with a simple usage note."
    : "";

  return `For this query, start with a clear diagnosis, shortlist the right product or service, and verify availability before placing the order or booking the repair.

Suggested components / next checks:
${list}${serviceContext}${productContext}

Practical flow:
1. Confirm the exact product or service requirement.
2. Match it to the most fitting shop item, part, or repair category.
3. Check compatibility, price, and availability.
4. If needed, guide the user to the booking or product detail page for next steps.${imageCount ? "\n\nI also received your uploaded image(s), but advanced image analysis needs Gemini connection." : ""}${note}`;
}

function shouldUseLocalFallback(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("ssl") ||
    message.includes("tls") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("network")
  );
}

function getRetryAfterMs(error) {
  const retryAfter = error?.headers?.get?.("retry-after") || error?.headers?.["retry-after"];
  const retryAfterSeconds = Number(retryAfter);
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : GEMINI_COOLDOWN_MS;
}

function isRateLimitError(error) {
  return Number(error?.status || error?.statusCode) === 429 || Number(error?.status) === 429;
}

function buildGeminiInlineImage(image) {
  return {
    inline_data: {
      mime_type: image.mimeType || "image/jpeg",
      data: image.base64,
    },
  };
}

function extractGeminiText(data) {
  if (data.candidates?.length && data.candidates[0].content) {
    return data.candidates[0].content.parts.map((part) => part.text).filter(Boolean).join("\n\n");
  }
  return "I could not generate a response. Please try again.";
}

async function buildProductSuggestions(promptText, aiText, availableProducts, deepSearch = false) {
  const context = `${promptText || ""}\n${aiText || ""}`;
  const wanted = extractWantedComponents(context);
  let products = [];
  try {
    products = Array.isArray(availableProducts) ? availableProducts : await fetchAvailableCatalogProducts();
  } catch (_error) {
    return [];
  }

  if (!products.length) return [];

  const usedProductIds = new Set();
  const candidates = [];

  products.forEach((product) => {
    const score = scoreProductAgainstContext(product, context);
    if (score > 0) {
      candidates.push({
        product,
        score,
        component: "Image/name match",
      });
    }
  });

  wanted.forEach((component) => {
    const ranked = products
      .map((product) => ({ product, score: scoreProduct(product, component) }))
      .filter((item) => item.score >= (deepSearch ? 1 : 2))
      .sort((a, b) => b.score - a.score);
    ranked.slice(0, deepSearch ? 4 : 2).forEach((item) => {
      candidates.push({
        product: item.product,
        score: item.score * 5,
        component,
      });
    });
  });

  return candidates
    .sort((a, b) => b.score - a.score)
    .flatMap((item) => {
      const id = String(item.product._id);
      if (usedProductIds.has(id)) return [];
      usedProductIds.add(id);
      return suggestionFromProduct(item.product, item.component);
    })
    .slice(0, deepSearch ? 12 : 8);
}

exports.chatWithScienceAI = catchAsync(async (req, res) => {
  const {
    message,
    imageBase64,
    imageMimeType = "image/jpeg",
    images = [],
    conversationHistory = [],
    thinkMode = false,
    deepSearch = false,
  } = req.body;
  const imageInputs = Array.isArray(images) && images.length
    ? images.slice(0, 5)
    : imageBase64
      ? [{ base64: imageBase64, mimeType: imageMimeType }]
      : [];

  if (!message && !imageInputs.length) {
    throw new AppError("Message or image is required", 400);
  }

  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    const aiResponse = buildLocalResponse(message, imageInputs.length, "Gemini API key is not configured.");
    const suggestions = await buildProductSuggestions(message, aiResponse, undefined, Boolean(deepSearch));
    return res.json({
      success: true,
      data: {
        response: aiResponse,
        suggestions,
        model: "local-fallback",
        warning: "Gemini API key is not configured. Returned local fallback response with catalog-verified product suggestions.",
        conversationHistory: [
          ...conversationHistory,
          { role: "user", text: message, images: imageInputs },
          { role: "ai", text: aiResponse, suggestions },
        ],
      },
    });
  }

  if (Date.now() < geminiCooldownUntil) {
    const seconds = getCooldownSeconds();
    const aiResponse = buildLocalResponse(message, imageInputs.length, `Gemini rate limit cooldown active for ${seconds} seconds.`);
    const suggestions = await buildProductSuggestions(message, aiResponse, undefined, Boolean(deepSearch));
    return res.json({
      success: true,
      data: {
        response: aiResponse,
        suggestions,
        model: "local-fallback",
        warning: `Gemini rate limit active. Returned local fallback response; retrying Gemini after ${seconds} seconds.`,
        conversationHistory: [
          ...conversationHistory,
          { role: "user", text: message, images: imageInputs },
          { role: "ai", text: aiResponse, suggestions },
        ],
      },
    });
  }

  let availableCatalogProducts = [];
  let websiteKnowledge = "";
  try {
    [availableCatalogProducts, websiteKnowledge] = await Promise.all([
      fetchAvailableCatalogProducts(),
      formatWebsiteKnowledgeForGemini(),
    ]);
  } catch (_error) {
    availableCatalogProducts = [];
    websiteKnowledge = await formatWebsiteKnowledgeForGemini();
  }

  const modeNotes = [
    thinkMode
      ? "Think mode is ON. Structure the answer as: 1) short understanding, 2) step-by-step reasoning, 3) clear final recommendation, 4) next action (product link, booking, or safety tip)."
      : "",
    deepSearch
      ? "Deep Search is ON. Compare more options from catalog, services, offers, and repair categories. Mention 2-4 alternatives with trade-offs (price/use-case/compatibility) when useful, then recommend the best fit."
      : "",
  ].filter(Boolean).join(" ");

  const systemContext = `You are Pulse AI, the polite customer assistant for Prakash Electronics and Electricals in Chitarpur, Jharkhand.
You help customers with:
- electronics shop products and electrical parts
- wiring accessories, MCB, switches, sockets, cables
- RGB lights and LED lighting
- home appliances repairing, cooler repairing, AC repairing, fan/TV/speaker repair
- bookings, offers/recent updates, about the shop, and website navigation
Keep continuity with previous messages. Be practical, polite, concise, and safety-aware.
When the user uploads product/component images, first identify visible labels, model numbers, component names, color/shape clues, and close visual matches.
When the user types a product or service name, normalize spelling and identify the likely match.
When recommending shop items, prefer exact catalog names from the verified catalog.
When recommending services/repairs, use website service cards and guide users to /booking when needed.
If nothing matches availability, say you cannot confirm a matching available catalog item.
${modeNotes}

${websiteKnowledge}

${formatCatalogForGemini(availableCatalogProducts, Boolean(deepSearch))}`;

  const contents = [];
  if (conversationHistory.length > 0) {
    conversationHistory.slice(-12).forEach((msg) => {
      const historyImages = Array.isArray(msg.images)
        ? msg.images
        : msg.imageBase64
          ? [{ base64: msg.imageBase64, mimeType: msg.imageMimeType }]
          : [];
      const parts = [{ text: msg.text || "" }];

      if (msg.role === "user") {
        historyImages.slice(0, 2).forEach((image) => {
          if (image.base64) parts.push(buildGeminiInlineImage(image));
        });
      }

      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts,
      });
    });
  }

  const currentParts = [];
  imageInputs.forEach((image) => {
    if (image.base64) currentParts.push(buildGeminiInlineImage(image));
  });
  currentParts.push({ text: message || "Please analyze these images and help identify useful products, parts, or repair guidance." });
  contents.push({ role: "user", parts: currentParts });

  const requestBody = JSON.stringify({
    contents,
    generationConfig: {
      temperature: thinkMode ? 0.45 : 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: deepSearch ? 3072 : 2048,
    },
    systemInstruction: {
      parts: [{ text: systemContext }],
    },
  });
  const modelCandidates = Array.from(new Set([env.geminiModel, ...FALLBACK_MODELS].filter(Boolean)));
  let geminiResponse;
  let geminiError = null;
  let errorData = {};
  let usedModel = modelCandidates[0];

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const model = modelCandidates[index];
    usedModel = model;
    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        },
      );
    } catch (error) {
      geminiError = error;
      break;
    }

    if (geminiResponse.ok) {
      geminiError = null;
      break;
    }

    errorData = await geminiResponse.json().catch(() => ({}));
    geminiError = {
      status: geminiResponse.status,
      headers: geminiResponse.headers,
      message: errorData.error?.message || `Gemini model ${model} request failed.`,
    };

    if (geminiResponse.status === 429) {
      geminiCooldownUntil = Date.now() + getRetryAfterMs(geminiResponse);
      if (index < modelCandidates.length - 1) continue;
      break;
    }

    if (geminiResponse.status !== 404) {
      break;
    }
  }

  if (!geminiResponse?.ok && geminiError && (shouldUseLocalFallback(geminiError) || isRateLimitError(geminiError))) {
    const aiResponse = buildLocalResponse(message, imageInputs.length, geminiError.message);
    const suggestions = await buildProductSuggestions(message, aiResponse, availableCatalogProducts, Boolean(deepSearch));
    const warning = isRateLimitError(geminiError)
      ? `Gemini rate limit reached. Returned local fallback response; retrying Gemini after ${getCooldownSeconds()} seconds.`
      : "Gemini network/TLS connection failed. Returned local fallback response.";
    return res.json({
      success: true,
      data: {
        response: aiResponse,
        suggestions,
        model: "local-fallback",
        warning,
        conversationHistory: [
          ...conversationHistory,
          { role: "user", text: message, images: imageInputs },
          { role: "ai", text: aiResponse, suggestions },
        ],
      }
    });
  }

  if (!geminiResponse?.ok) {
    throw new AppError(
      geminiError?.message || `Gemini model is not available. Tried: ${modelCandidates.join(", ")}`,
      geminiError?.status || 500,
      { triedModels: modelCandidates },
    );
  }

  const data = await geminiResponse.json();
  const aiResponse = extractGeminiText(data);

  const suggestions = await buildProductSuggestions(message, aiResponse, availableCatalogProducts, Boolean(deepSearch));

  res.json({
    success: true,
    data: {
      response: aiResponse,
      suggestions,
      model: usedModel,
      conversationHistory: [
        ...conversationHistory,
        { role: "user", text: message, images: imageInputs },
        { role: "ai", text: aiResponse, suggestions },
      ],
    },
  });
});

exports.scienceAIHealth = catchAsync(async (_req, res) => {
  res.json({
    success: true,
    data: {
      available: Boolean(env.geminiApiKey),
      model: env.geminiModel,
    },
  });
});
