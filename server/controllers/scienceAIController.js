const catchAsync = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const env = require("../config/env");
const ProjectPart = require("../models/ProjectPart");
const ShopProduct = require("../models/ShopProduct");
const { availableStockQuantity } = require("../utils/inventory");
const { getSitePayload } = require("../services/siteService");
const {
  extractWantedComponents: extractWantedFromPrompt,
  formatProductMemoryLine,
  rankProductsForDemand,
  stripCatalogMatchLine,
} = require("./scienceAIProductMatch");

const GEMINI_COOLDOWN_MS = 65 * 1000;
let geminiCooldownUntil = 0;
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

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
    .slice(0, deepSearch ? 220 : 160)
    .map((product) => formatProductMemoryLine(product))
    .join("\n");

  if (!catalog) return "No verified available product catalog is loaded right now.";
  return [
    "MEMORIZED PRODUCT CATALOG (source of truth). Each line has name, category, stock, price, colors, tags, description.",
    "Only recommend products from this list. Never invent products or availability.",
    "Match the customer's demanded product type and color strictly.",
    catalog,
  ].join("\n");
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
    products = Array.isArray(availableProducts) ? availableProducts : await fetchAvailableCatalogProducts();
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

  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    const aiResponse = buildLocalResponse(message, imageInputs.length, "Gemini API key is not configured.");
    const suggestions = await buildProductSuggestions(message, aiResponse, undefined, Boolean(deepSearch), {
      hasImages: Boolean(imageInputs.length),
    });
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
    const suggestions = await buildProductSuggestions(message, aiResponse, undefined, Boolean(deepSearch), {
      hasImages: Boolean(imageInputs.length),
    });
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
1. Recommend ONLY products from the memorized catalog below that match what the customer demanded OR what the uploaded image shows.
2. If they ask for cooling/fan/cooler, ONLY mention finished cooling/fan/cooler catalog items — never motors, capacitors, speakers, lamps, or unrelated SKUs.
3. If they ask for a color (e.g. blue fan / white cooler), or the image shows a clear color, prioritize catalog items with that color.
4. Do not pad the answer with unrelated catalog products.
5. If no catalog item matches, clearly say no matching available product was found and offer closest alternatives only if they still fit the demand category.
6. For image-only chats, still identify the product and return IMAGE_FINDINGS + CATALOG_MATCHES.

When recommending services/repairs, use website service cards and guide users to /booking when needed.
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
  const userText = message
    || (imageInputs.length
      ? "Analyze these product photo(s). Identify the exact product type, colors, labels, and shape. Then match the closest finished products from the memorized catalog and return IMAGE_FINDINGS + CATALOG_MATCHES."
      : "Please help me find the right product.");
  currentParts.push({ text: userText });
  contents.push({ role: "user", parts: currentParts });

  const requestBody = JSON.stringify({
    contents,
    generationConfig: {
      temperature: imageInputs.length ? (thinkMode ? 0.25 : 0.35) : (thinkMode ? 0.45 : 0.7),
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
    const suggestions = await buildProductSuggestions(message, aiResponse, availableCatalogProducts, Boolean(deepSearch), {
      hasImages: Boolean(imageInputs.length),
    });
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
  const rawAiResponse = extractGeminiText(data);
  const suggestions = await buildProductSuggestions(message, rawAiResponse, availableCatalogProducts, Boolean(deepSearch), {
    hasImages: Boolean(imageInputs.length),
  });
  const aiResponse = stripCatalogMatchLine(rawAiResponse);

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
