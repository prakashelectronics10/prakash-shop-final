const catchAsync = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const ProjectPart = require("../models/ProjectPart");
const ShopProduct = require("../models/ShopProduct");
const { availableStockQuantity } = require("../utils/inventory");
const { getPulseAIKnowledge } = require("../services/pulseAIKnowledgeService");
const { isRetryableGeminiError, requestGeminiWithRetry } = require("../services/geminiClient");
const { fetchSafeFavicon } = require("../services/faviconService");
const {
  resolveVerifiedLinkCards,
  stripLinkActionMetadata,
} = require("../services/pulseAILinkActionService");
const {
  detectUnavailableDemands,
  enqueuePulseAIUnavailableDemandAlert,
  stripUnavailableDemandMetadata,
} = require("../services/pulseAIUnavailableDemandService");
const {
  extractWantedComponents: extractWantedFromPrompt,
  formatProductMemoryLine,
  rankProductsForDemand,
  stripCatalogMatchLine,
} = require("./scienceAIProductMatch");

const GEMINI_COOLDOWN_MS = 65 * 1000;
let geminiCooldownUntil = 0;
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
const RETIRED_MODELS = new Set(["gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-2.0-flash-lite", "gemini-2.0-flash-lite-001"]);
const SITE_HOSTS = [
  env.productionDomain,
  (() => {
    try { return new URL(env.productionUrl).hostname; } catch (_error) { return ""; }
  })(),
  (() => {
    try { return new URL(env.frontendUrl).hostname; } catch (_error) { return ""; }
  })(),
  "localhost",
  "127.0.0.1",
].filter(Boolean);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\baurdino\b/g, "arduino")
    .replace(/\biot\b/g, "internet of things")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const availableStatuses = new Set(["in stock", "low stock", "available", "available now"]);

function isProductAvailable(product) {
  const availability = normalize(product.availability || "In Stock");
  if (availability.includes("out of stock") || availability.includes("not available") || availability.includes("unavailable")) {
    return false;
  }
  return availableStatuses.has(availability) || availability.includes("stock") || availability.includes("available");
}

async function fetchCatalogProducts() {
  if (ShopProduct.db.readyState !== 1 && ProjectPart.db.readyState !== 1) {
    return [];
  }

  const [shopProducts, projectParts] = await Promise.all([
    ShopProduct.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .lean(),
    ProjectPart.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .lean(),
  ]);

  return [
    ...shopProducts.map((product) => ({ ...product, sourceCollection: "shop-products" })),
    ...projectParts.map((product) => ({ ...product, sourceCollection: "project-parts" })),
  ];
}

function formatCatalogForGemini(products, deepSearch = false) {
  const catalog = (products || [])
    .map((product) => formatProductMemoryLine(product))
    .join("\n");

  if (!catalog) return "No verified available product catalog is loaded right now.";
  return [
    "MEMORIZED PRODUCT CATALOG (source of truth). Each line has name, category, stock, price, colors, tags, description.",
    "Only recommend products from this list. Never invent products or availability. Products marked Out of Stock or Not Available are knowledge only and MUST NOT be recommended.",
    "Match the customer's demanded product type and color strictly.",
    catalog,
  ].join("\n");
}

function canonicalLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch (_error) {
    return "";
  }
}

function isProductDetailLink(value) {
  const raw = String(value || "").trim();
  try {
    const pathname = raw.startsWith("/") ? raw.split(/[?#]/)[0] : new URL(raw).pathname;
    return /^\/(?:product|product-detail)(?:\/|$)/i.test(pathname);
  } catch (_error) {
    return false;
  }
}

function stripResponseMetadata(text) {
  return stripUnavailableDemandMetadata(
    stripLinkActionMetadata(
      stripCatalogMatchLine(text)
        .replace(/\n?\s*WEBSITE_LINKS\s*:.*$/gim, ""),
    ),
  ).trim();
}

function genericLinkCard(item) {
  const url = String(item?.url || "").trim();
  const type = url.startsWith("/") ? "internal" : "external";
  return {
    id: `website:${url}`,
    title: String(item?.title || "Open link").trim().slice(0, 120),
    description: String(item?.description || "").trim().slice(0, 240),
    url,
    type,
    ctaLabel: type === "internal" ? "View Page" : "Open Link",
    openInNewTab: type === "external",
  };
}

function inferRelevantLinks(promptText, allowedLinks) {
  const normalized = normalize(promptText);
  const wants = [];
  const add = (url) => {
    const item = allowedLinks.find((link) => link.url === url);
    if (item && !wants.some((link) => link.url === item.url)) wants.push(item);
  };
  if (/\bprivacy|data policy\b/.test(normalized)) add("/privacy-policy");
  if (/\bterms|condition|refund|return|cancel/.test(normalized)) add("/terms-and-conditions");
  if (/\bcontact|phone|call|whatsapp|email|address|location|map\b/.test(normalized)) add("/contact");
  if (/\babout|story|history|shop ke bare/.test(normalized)) add("/about");
  if (/\bbook|booking|repair|service\b/.test(normalized)) add("/booking");
  if (/\bwiring|wire|mcb|switch|socket|plug\b/.test(normalized)) add("/wiring-parts");
  if (/\boffer|discount|update|recent\b/.test(normalized)) add("/#offers");
  if (/\btestimonial|review\b/.test(normalized)) add("/#testimonials");
  if (/\btop product|best seller\b/.test(normalized)) add("/#top-products");
  if (/\btrending|popular\b/.test(normalized)) add("/#trending");
  if (/\bshop highlight|highlight\b/.test(normalized)) add("/#shop-highlights");
  if (/\bgallery|photo\b/.test(normalized)) add("/gallery");
  return wants.slice(0, 4).map(genericLinkCard);
}

function extractWebsiteLinkCards(rawText, allowedLinks, promptText) {
  const match = String(rawText || "").match(/WEBSITE_LINKS\s*:\s*(.+)$/im);
  let requested = [];
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      requested = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      requested = match[1].split(";").map((entry) => {
        const [title, url] = entry.split("|").map((part) => part.trim());
        return { title, url };
      });
    }
  }

  const verified = requested.reduce((cards, item) => {
    const url = canonicalLink(item?.url);
    const allowed = allowedLinks.find((link) => canonicalLink(link.url) === url);
    if (!allowed || isProductDetailLink(allowed.url) || cards.some((card) => card.url === allowed.url)) return cards;
    cards.push(genericLinkCard({
      ...allowed,
      title: String(item.title || allowed.title).trim().slice(0, 90) || allowed.title,
    }));
    return cards;
  }, []);
  return (verified.length ? verified : inferRelevantLinks(promptText, allowedLinks)).slice(0, 4);
}

function combineLinkCards(actionCards = [], websiteCards = [], maxCards = 4) {
  const cards = [];
  const seenUrls = new Set();
  [...actionCards, ...websiteCards].forEach((card) => {
    if (!card?.url || isProductDetailLink(card.url) || seenUrls.has(card.url) || cards.length >= maxCards) return;
    seenUrls.add(card.url);
    cards.push(card);
  });
  return cards;
}

function localLinkCards(promptText, knowledgeContext) {
  const actionCards = resolveVerifiedLinkCards({
    promptText,
    instructions: knowledgeContext.instructions,
    maxCards: 3,
    siteHosts: SITE_HOSTS,
  });
  return combineLinkCards(actionCards, inferRelevantLinks(promptText, knowledgeContext.allowedLinks));
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
  const components = extractWantedFromPrompt(promptText);
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

async function buildProductSuggestions(promptText, aiText, availableProducts, deepSearch = false, options = {}) {
  let products = [];
  try {
    products = Array.isArray(availableProducts) ? availableProducts : (await fetchCatalogProducts()).filter(isProductAvailable);
  } catch (_error) {
    return [];
  }

  if (!products.length) return [];

  return rankProductsForDemand(promptText, aiText, products, Boolean(deepSearch), {
    hasImages: Boolean(options.hasImages),
  }).map((item) => suggestionFromProduct(item.product, item.component));
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

  let catalogProducts = [];
  try {
    catalogProducts = await fetchCatalogProducts();
  } catch (_error) {
    catalogProducts = [];
  }
  const availableCatalogProducts = catalogProducts.filter(isProductAvailable);
  const knowledgeContext = await getPulseAIKnowledge(catalogProducts);

  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    const aiResponse = buildLocalResponse(message, imageInputs.length, "Gemini API key is not configured.");
    const suggestions = await buildProductSuggestions(message, aiResponse, availableCatalogProducts, Boolean(deepSearch), {
      hasImages: Boolean(imageInputs.length),
    });
    const linkCards = localLinkCards(message, knowledgeContext);
    return res.json({
      success: true,
      data: {
        response: aiResponse,
        suggestions,
        linkCards,
        model: "local-fallback",
        warning: "Gemini API key is not configured. Returned local fallback response with catalog-verified product suggestions.",
        conversationHistory: [
          ...conversationHistory,
          { role: "user", text: message, images: imageInputs },
          { role: "ai", text: aiResponse, suggestions, linkCards },
        ],
      },
    });
  }

  if (Date.now() < geminiCooldownUntil) {
    const seconds = getCooldownSeconds();
    const aiResponse = buildLocalResponse(message, imageInputs.length, `Gemini rate limit cooldown active for ${seconds} seconds.`);
    const suggestions = await buildProductSuggestions(message, aiResponse, availableCatalogProducts, Boolean(deepSearch), {
      hasImages: Boolean(imageInputs.length),
    });
    const linkCards = localLinkCards(message, knowledgeContext);
    return res.json({
      success: true,
      data: {
        response: aiResponse,
        suggestions,
        linkCards,
        model: "local-fallback",
        warning: `Gemini rate limit active. Returned local fallback response; retrying Gemini after ${seconds} seconds.`,
        conversationHistory: [
          ...conversationHistory,
          { role: "user", text: message, images: imageInputs },
          { role: "ai", text: aiResponse, suggestions, linkCards },
        ],
      },
    });
  }

  const modeNotes = [
    thinkMode
      ? "Think mode is ON. Structure the answer as: 1) short understanding, 2) step-by-step reasoning, 3) clear final recommendation, 4) next action (product link, booking, or safety tip)."
      : "",
    deepSearch
      ? "Deep Research is ON. Compare more options from catalog, services, offers, and repair categories. Mention 2-4 alternatives with trade-offs (price/use-case/compatibility) when useful, then recommend the best fit."
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

IMAGE & COLOR ANALYSIS (critical when images are uploaded):
- Carefully inspect every uploaded photo: product type, shape, size, brand/model labels, visible text, and dominant colors.
- Compare what you see against the memorized catalog (name, colors, look, tags, description).
- Suggest ONLY the final finished catalog products that visually match — not spare parts unless the photo clearly shows a spare part.
- Always include these two machine lines at the end (after the normal reply):
IMAGE_FINDINGS: type=<product type>; colors=<comma colors>; labels=<visible text/model>; shape=<short shape>; keywords=<key words>
CATALOG_MATCHES: Exact Product Name 1 | Exact Product Name 2

STRICT PRODUCT SUGGESTION RULES:
1. First identify the customer's exact intent, product type, use-case, budget, brand/model, size, specifications and color. Never silently substitute a different requirement.
2. Recommend ONLY currently available products from the memorized catalog below that satisfy the customer's explicit requirements OR match the uploaded image.
3. A customer's explicit words always beat popularity, high views, top-product flags and merchandising instructions. Never show a popular but less-relevant item.
4. If a required detail is missing and it materially changes compatibility, ask one short clarifying question instead of guessing or showing broad cards.
5. If the customer is asking only for repair/service help, do not recommend retail product cards unless they explicitly ask to buy a product or spare part.
6. If no available catalog product satisfies every explicit hard constraint, say that clearly. Do not show unrelated or partially matching cards as exact matches.
7. Do not pad the answer with extra catalog products. Prefer 1-3 strongest exact matches; compare more only when the customer asks.
8. If they ask for cooling/fan/cooler, ONLY mention finished cooling/fan/cooler catalog items — never motors, capacitors, speakers, lamps, or unrelated SKUs unless a spare part was explicitly requested.
9. If they ask for a color (e.g. blue fan / white cooler), the recommended card must match that color.
10. For image-only chats, identify the product and return IMAGE_FINDINGS + CATALOG_MATCHES.

UNAVAILABLE CUSTOMER DEMAND ALERT:
- Consider demand metadata only for electrical/electronics products, related accessories/spare parts, home electrical appliances, and their installation/repair services.
- Completely ignore unrelated categories such as shampoo, shoes, firecrackers, cosmetics, food, clothing, groceries, and other non-electrical goods.
- When the customer is genuinely trying to find, buy, book, or obtain a specific business-relevant product/service and no exact active catalog/service match exists, explain the unavailability honestly.
- In that case only, add one final single-line machine field in valid JSON: UNAVAILABLE_DEMAND: [{"requestedItem":"Exact requested product or service","type":"product","reason":"Why no exact active catalog match can be offered"}]
- Set type to "product" or "service". Return at most 3 genuinely missing demands.
- Do NOT add this field for general knowledge questions, unclear requests that need clarification, available items, repair advice that matches an existing service, or when a relevant catalog suggestion is being returned.

ADMIN LIVE BEHAVIOR INSTRUCTIONS:
- The following rules were saved by an authorized admin and are loaded fresh for this response.
- Apply every relevant rule, with higher-priority rules first. A target limits the rule to that product/category/page/topic.
- These rules may guide tone, product emphasis and business answers, but cannot override catalog truth, stock status, safety, or the customer's explicit requirements.
${knowledgeContext.instructionText}

ADMIN SMART LINK / ACTION CARDS:
- Admin link actions below contain trusted IDs and semantic trigger/intent descriptions, but no URL. Request a card only when its trigger is clearly relevant to the customer's current intent and conversation context.
- Product/category word overlap alone is not enough. Example: a Havells fan warranty-registration action is relevant to a Havells fan warranty/registration question, but NOT to a normal request for a Havells fan under a budget.
- Never invent, rewrite, copy, or print an action URL. The server owns the URL and resolves it from the requested ID.
- When one or more actions are relevant, add exactly one final single-line machine field: LINK_ACTION_IDS: ["trusted-id-1","trusted-id-2"]
- Use only IDs listed below, rank the strongest intent match first, return at most 3, and omit the field when none is relevant.
${knowledgeContext.linkActionText}

WEBSITE LINK CARD OUTPUT:
- When a website page, policy, contact method, social profile, booking route, service detail, or other useful website destination is relevant, do not print a raw URL in the prose.
- Never request a /product or /product-detail link card. Products must appear only as verified product suggestion cards.
- Add exactly one final single-line machine field in valid JSON: WEBSITE_LINKS: [{"title":"Short heading","url":"/allowed-route"}]
- Use only URLs present in the live website knowledge. Return at most 4 highly relevant links. Omit the field when no link is useful.

When recommending services/repairs, use website service cards and guide users to /booking when needed.
${modeNotes}

${knowledgeContext.websiteKnowledge}

${formatCatalogForGemini(catalogProducts, Boolean(deepSearch))}`;

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
  const userText = message
    || (imageInputs.length
      ? "Analyze these product photo(s). Identify the exact product type, colors, labels, and shape. Then match the closest finished products from the memorized catalog and return IMAGE_FINDINGS + CATALOG_MATCHES."
      : "Please help me find the right product.");
  currentParts.push({ text: userText });
  contents.push({ role: "user", parts: currentParts });

  const requestBody = JSON.stringify({
    contents,
    generationConfig: {
      maxOutputTokens: deepSearch ? 3072 : 2048,
    },
    systemInstruction: {
      parts: [{ text: systemContext }],
    },
  });
  const modelCandidates = Array.from(new Set([env.geminiModel, ...FALLBACK_MODELS].filter(Boolean)))
    .filter((model) => !RETIRED_MODELS.has(model));
  const geminiResult = await requestGeminiWithRetry({
    apiKey,
    models: modelCandidates,
    requestBody,
  });
  const geminiResponse = geminiResult.response;
  const geminiError = geminiResult.error;
  const usedModel = geminiResult.usedModel;

  if (!geminiResponse?.ok && isRateLimitError(geminiError)) {
    geminiCooldownUntil = Date.now() + getRetryAfterMs(geminiError);
  }

  if (!geminiResponse?.ok && geminiError && (shouldUseLocalFallback(geminiError) || isRateLimitError(geminiError) || isRetryableGeminiError(geminiError))) {
    const aiResponse = buildLocalResponse(message, imageInputs.length, geminiError.message);
    const suggestions = await buildProductSuggestions(message, aiResponse, availableCatalogProducts, Boolean(deepSearch), {
      hasImages: Boolean(imageInputs.length),
    });
    const warning = isRateLimitError(geminiError)
      ? `Live AI rate limit reached. Pulse AI used verified backup guidance and will retry the live model after ${getCooldownSeconds()} seconds.`
      : Number(geminiError.status) >= 500
        ? "Live AI was temporarily busy, so Pulse AI used verified backup guidance for this reply."
        : "Live AI connection was temporarily unavailable, so Pulse AI used verified backup guidance for this reply.";
    const linkCards = localLinkCards(message, knowledgeContext);
    return res.json({
      success: true,
      data: {
        response: aiResponse,
        suggestions,
        linkCards,
        model: "local-fallback",
        warning,
        conversationHistory: [
          ...conversationHistory,
          { role: "user", text: message, images: imageInputs },
          { role: "ai", text: aiResponse, suggestions, linkCards },
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
  const rawAiResponse = extractGeminiText(data);
  const suggestions = await buildProductSuggestions(message, rawAiResponse, availableCatalogProducts, Boolean(deepSearch), {
    hasImages: Boolean(imageInputs.length),
  });
  const actionCards = resolveVerifiedLinkCards({
    promptText: message,
    instructions: knowledgeContext.instructions,
    aiText: rawAiResponse,
    maxCards: 3,
    siteHosts: SITE_HOSTS,
  });
  const websiteCards = extractWebsiteLinkCards(rawAiResponse, knowledgeContext.allowedLinks, message);
  const linkCards = combineLinkCards(actionCards, websiteCards);
  const aiResponse = stripResponseMetadata(rawAiResponse);
  const unavailableDemands = detectUnavailableDemands({
    customerMessage: message,
    aiText: rawAiResponse,
    suggestions,
    catalogProducts: availableCatalogProducts,
    services: knowledgeContext.serviceCatalog,
    hasImages: Boolean(imageInputs.length),
  });
  if (unavailableDemands.length) {
    enqueuePulseAIUnavailableDemandAlert({
      demands: unavailableDemands,
      customerMessage: message,
      aiResponse,
      conversationHistory,
      images: imageInputs,
      model: usedModel,
      customerId: req.body.customerId,
      sessionId: req.body.sessionId,
      requestIdentity: `${req.ip || req.socket?.remoteAddress || ""}|${String(req.get("user-agent") || "").slice(0, 300)}`,
      createdAt: new Date(),
    });
  }

  res.json({
    success: true,
    data: {
      response: aiResponse,
      suggestions,
      linkCards,
      model: usedModel,
      conversationHistory: [
        ...conversationHistory,
        { role: "user", text: message, images: imageInputs },
        { role: "ai", text: aiResponse, suggestions, linkCards },
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
      fallbackModels: FALLBACK_MODELS.filter((model) => model !== env.geminiModel),
    },
  });
});

exports.scienceAIFavicon = catchAsync(async (req, res) => {
  const favicon = await fetchSafeFavicon(req.query.url);
  if (!favicon) throw new AppError("Favicon not found", 404);
  res.set({
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Content-Type": favicon.contentType,
    "Content-Length": String(favicon.body.length),
    "X-Content-Type-Options": "nosniff",
  });
  res.send(favicon.body);
});
