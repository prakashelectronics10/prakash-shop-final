const env = require("../config/env");
const Offer = require("../models/Offer");
const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const WhatsAppAISettings = require("../models/WhatsAppAISettings");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const { getPulseAIKnowledge } = require("./pulseAIKnowledgeService");
const { requestGeminiWithRetry, isRetryableGeminiError } = require("./geminiClient");
const {
  sendTextMessage,
  sendImageMessage,
  sendInteractiveMessage,
} = require("./whatsappCloudApiService");
const { recordMessage } = require("./whatsappConversationService");
const { logger } = require("../utils/logger");

const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part.text || "").join("\n").trim();
}

function extractJsonBlock(text, label) {
  const match = String(text || "").match(new RegExp(`${label}:\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\])`, "i"));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (_error) {
    return null;
  }
}

function stripWhatsAppMetadata(text) {
  return String(text || "")
    .replace(/WHATSAPP_IMAGES:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])/gi, "")
    .replace(/WHATSAPP_BUTTONS:\s*(\{[\s\S]*?\}|\[[\s\S]*?\])/gi, "")
    .replace(/CONVERSATION_MEMORY:\s*(\{[\s\S]*?\})/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadImageCatalog() {
  const now = new Date();
  const [offers, shopProducts, projectParts] = await Promise.all([
    Offer.find({ isActive: true })
      .select("title description code imageUrl startsAt endsAt")
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(30)
      .lean(),
    ShopProduct.find({ isActive: { $ne: false } })
      .select("name slug imageUrl images price colors tags")
      .sort({ updatedAt: -1 })
      .limit(80)
      .lean()
      .catch(() => []),
    ProjectPart.find({ isActive: { $ne: false } })
      .select("name slug imageUrl images price colors tags")
      .sort({ updatedAt: -1 })
      .limit(80)
      .lean()
      .catch(() => []),
  ]);

  const activeOffers = offers.filter((offer) => {
    if (offer.startsAt && new Date(offer.startsAt) > now) return false;
    if (offer.endsAt && new Date(offer.endsAt) < now) return false;
    return Boolean(offer.imageUrl);
  });

  const products = [...shopProducts, ...projectParts]
    .map((product) => {
      const imageUrl = product.imageUrl
        || (Array.isArray(product.images) && product.images[0]?.url)
        || (Array.isArray(product.images) && typeof product.images[0] === "string" ? product.images[0] : "");
      return {
        id: String(product._id),
        name: product.name,
        slug: product.slug || "",
        imageUrl: imageUrl || "",
        price: product.price,
        colors: product.colors || [],
        tags: product.tags || [],
        kind: "product",
      };
    })
    .filter((item) => item.imageUrl);

  const offerItems = activeOffers.map((offer) => ({
    id: String(offer._id),
    name: offer.title,
    description: offer.description || "",
    code: offer.code || "",
    imageUrl: offer.imageUrl,
    kind: "offer",
  }));

  return { products, offers: offerItems };
}

function formatImageCatalogForPrompt(catalog) {
  const offerLines = catalog.offers.slice(0, 20).map((item, index) => (
    `${index + 1}. [offer:${item.id}] ${item.name}${item.code ? ` (code ${item.code})` : ""} | image=${item.imageUrl}`
  ));
  const productLines = catalog.products.slice(0, 40).map((item, index) => (
    `${index + 1}. [product:${item.id}] ${item.name} | image=${item.imageUrl}`
  ));
  return [
    "AVAILABLE OFFER IMAGES (attach when customer asks about offers/updates/discounts):",
    offerLines.length ? offerLines.join("\n") : "(none)",
    "",
    "AVAILABLE PRODUCT IMAGES (attach when recommending matching products):",
    productLines.length ? productLines.join("\n") : "(none)",
  ].join("\n");
}

async function getOrCreateAISettings(accountId) {
  return WhatsAppAISettings.findOneAndUpdate(
    { account: accountId },
    { $setOnInsert: { account: accountId } },
    { upsert: true, new: true },
  );
}

async function buildHistoryForModel(conversationId) {
  const messages = await WhatsAppMessage.find({ conversation: conversationId })
    .sort({ createdAt: -1 })
    .limit(16)
    .lean();

  return messages.reverse().map((message) => ({
    role: message.direction === "inbound" ? "user" : "model",
    text: message.text || (message.type === "image" ? "[image]" : message.type),
  }));
}

async function generateWhatsAppAIReply({
  account,
  conversation,
  customerMessage,
  settings,
}) {
  const knowledge = await getPulseAIKnowledge();
  const imageCatalog = await loadImageCatalog();
  const history = await buildHistoryForModel(conversation._id);
  const maxImages = Math.max(0, Math.min(5, Number(settings.maxImagesPerReply ?? 3)));

  const systemPrompt = `You are Pulse AI on WhatsApp for Prakash Electronics and Electricals (Chitarpur, Jharkhand).
Reply in clear, polite WhatsApp style. Keep answers concise (usually under 900 characters) unless the customer needs steps.
Use shop knowledge, offers, and catalog truth. Never invent prices or stock.

${settings.systemPromptExtra ? `EXTRA ADMIN INSTRUCTIONS:\n${settings.systemPromptExtra}\n` : ""}

ADMIN LIVE BEHAVIOR INSTRUCTIONS:
${knowledge.instructionText || "(none)"}

${knowledge.websiteKnowledge || ""}

${formatImageCatalogForPrompt(imageCatalog)}

OUTPUT RULES:
1. Write the customer-facing reply first in plain text (no markdown headings).
2. If images help (offers/recent updates/product match), add one machine line:
WHATSAPP_IMAGES: [{"id":"offer:ID or product:ID","reason":"short"}]
Only use IDs from the lists above. Max ${maxImages} images. Prefer offer images for offer questions.
3. If helpful, add reply buttons (max 3) with:
WHATSAPP_BUTTONS: [{"label":"max 20 chars","type":"url|quick_reply|copy_code","url":"https://...","code":"","payload":""}]
4. Optionally end with:
CONVERSATION_MEMORY: {"summary":"...","importantFacts":[],"openTopics":[]}
`;

  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    return {
      text: "Thanks for messaging Prakash Electronics. Our assistant is briefly unavailable — please share what you need and our team will help shortly.",
      images: [],
      buttons: [],
      memory: conversation.conversationMemory || {},
      model: "local-fallback",
    };
  }

  const contents = history.slice(-14).map((item) => ({
    role: item.role,
    parts: [{ text: String(item.text || "").slice(0, 4000) }],
  }));
  contents.push({ role: "user", parts: [{ text: String(customerMessage || "").slice(0, 4000) }] });

  const requestBody = JSON.stringify({
    contents,
    generationConfig: { maxOutputTokens: 1400 },
    systemInstruction: { parts: [{ text: systemPrompt }] },
  });

  const models = Array.from(new Set([env.geminiModel, ...FALLBACK_MODELS].filter(Boolean)));
  const geminiResult = await requestGeminiWithRetry({ apiKey, models, requestBody });

  if (!geminiResult.response?.ok) {
    const err = geminiResult.error;
    if (err && (isRetryableGeminiError(err) || Number(err.status) >= 500)) {
      return {
        text: "Thanks for your message. Please give us a moment — a team member or assistant will reply shortly.",
        images: [],
        buttons: [],
        memory: conversation.conversationMemory || {},
        model: "local-fallback",
      };
    }
    throw err || new Error("Gemini unavailable");
  }

  const data = await geminiResult.response.json();
  const raw = extractGeminiText(data);
  const imageRefs = extractJsonBlock(raw, "WHATSAPP_IMAGES");
  const buttonRefs = extractJsonBlock(raw, "WHATSAPP_BUTTONS");
  const memory = extractJsonBlock(raw, "CONVERSATION_MEMORY") || conversation.conversationMemory || {};
  const text = stripWhatsAppMetadata(raw) || "How can I help you with products, offers, or repairs today?";

  const imageLookup = new Map([
    ...imageCatalog.offers.map((item) => [`offer:${item.id}`, item]),
    ...imageCatalog.products.map((item) => [`product:${item.id}`, item]),
  ]);

  let images = [];
  if (settings.sendOfferImages !== false || settings.sendProductImages !== false) {
    const refs = Array.isArray(imageRefs) ? imageRefs : [];
    images = refs
      .map((ref) => {
        const key = String(ref?.id || ref || "").trim();
        const item = imageLookup.get(key);
        if (!item) return null;
        if (item.kind === "offer" && settings.sendOfferImages === false) return null;
        if (item.kind === "product" && settings.sendProductImages === false) return null;
        return { ...item, reason: ref?.reason || "" };
      })
      .filter(Boolean)
      .slice(0, maxImages);
  }

  const buttons = settings.allowButtons === false
    ? []
    : (Array.isArray(buttonRefs) ? buttonRefs : [])
      .filter((button) => button?.label)
      .slice(0, 3)
      .map((button, index) => ({
        id: `ai_${index + 1}`,
        type: ["url", "copy_code", "quick_reply"].includes(button.type) ? button.type : "quick_reply",
        label: String(button.label).slice(0, 20),
        url: String(button.url || "").trim(),
        code: String(button.code || "").trim().slice(0, 15),
        payload: String(button.payload || "").trim().slice(0, 80),
      }));

  return {
    text,
    images,
    buttons,
    memory,
    model: geminiResult.usedModel || env.geminiModel,
  };
}

async function sendAIOutbound({ account, conversation, reply }) {
  const creds = {
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: conversation.customerWaId,
  };

  const recorded = [];

  if (reply.buttons?.length === 1 && reply.buttons[0].type === "url" && reply.buttons[0].url) {
    const button = reply.buttons[0];
    const result = await sendInteractiveMessage({
      ...creds,
      interactive: {
        type: "cta_url",
        body: { text: reply.text.slice(0, 1024) },
        action: {
          name: "cta_url",
          parameters: { display_text: button.label, url: button.url },
        },
      },
    });
    recorded.push(await recordMessage({
      accountId: account._id,
      conversationId: conversation._id,
      customerWaId: conversation.customerWaId,
      direction: "outbound",
      sender: "ai",
      type: "interactive",
      text: reply.text,
      buttons: reply.buttons,
      waMessageId: result?.messages?.[0]?.id || "",
      meta: { model: reply.model },
    }));
  } else if (reply.buttons?.some((button) => button.type !== "url")) {
    const replyButtons = reply.buttons
      .filter((button) => button.type !== "url")
      .slice(0, 3)
      .map((button) => ({
        type: "reply",
        reply: {
          id: button.type === "copy_code" ? `copy:${button.code}` : (button.payload || button.id),
          title: button.label,
        },
      }));
    const result = await sendInteractiveMessage({
      ...creds,
      interactive: {
        type: "button",
        body: { text: reply.text.slice(0, 1024) },
        action: { buttons: replyButtons },
      },
    });
    recorded.push(await recordMessage({
      accountId: account._id,
      conversationId: conversation._id,
      customerWaId: conversation.customerWaId,
      direction: "outbound",
      sender: "ai",
      type: "interactive",
      text: reply.text,
      buttons: reply.buttons,
      waMessageId: result?.messages?.[0]?.id || "",
      meta: { model: reply.model },
    }));
    for (const button of reply.buttons.filter((item) => item.type === "url" && item.url)) {
      const text = `${button.label}: ${button.url}`;
      const resultText = await sendTextMessage({ ...creds, text });
      recorded.push(await recordMessage({
        accountId: account._id,
        conversationId: conversation._id,
        customerWaId: conversation.customerWaId,
        direction: "outbound",
        sender: "ai",
        type: "text",
        text,
        waMessageId: resultText?.messages?.[0]?.id || "",
      }));
    }
  } else {
    const result = await sendTextMessage({ ...creds, text: reply.text });
    recorded.push(await recordMessage({
      accountId: account._id,
      conversationId: conversation._id,
      customerWaId: conversation.customerWaId,
      direction: "outbound",
      sender: "ai",
      type: "text",
      text: reply.text,
      waMessageId: result?.messages?.[0]?.id || "",
      meta: { model: reply.model },
    }));
  }

  for (const image of reply.images || []) {
    const caption = image.kind === "offer"
      ? `${image.name}${image.code ? ` · Code: ${image.code}` : ""}`
      : image.name;
    const result = await sendImageMessage({
      ...creds,
      imageUrl: image.imageUrl,
      caption,
    });
    recorded.push(await recordMessage({
      accountId: account._id,
      conversationId: conversation._id,
      customerWaId: conversation.customerWaId,
      direction: "outbound",
      sender: "ai",
      type: "image",
      text: caption,
      mediaUrl: image.imageUrl,
      waMessageId: result?.messages?.[0]?.id || "",
      meta: { imageId: image.id, kind: image.kind },
    }));
  }

  return recorded;
}

async function maybeReplyWithAI({ account, conversation, customerMessage }) {
  if (!conversation || conversation.humanTakeover) {
    return { skipped: true, reason: "human_takeover" };
  }
  if (conversation.aiEnabled === false) {
    return { skipped: true, reason: "conversation_ai_disabled" };
  }

  const settings = await getOrCreateAISettings(account._id);
  if (!settings.enabled) {
    return { skipped: true, reason: "ai_disabled" };
  }

  const reply = await generateWhatsAppAIReply({
    account,
    conversation,
    customerMessage,
    settings,
  });

  conversation.conversationMemory = reply.memory || conversation.conversationMemory || {};
  await conversation.save();

  await sendAIOutbound({ account, conversation, reply });
  logger.info("whatsapp.ai.replied", {
    accountId: String(account._id),
    customerWaId: conversation.customerWaId,
    images: reply.images?.length || 0,
    buttons: reply.buttons?.length || 0,
  });
  return { skipped: false, reply };
}

module.exports = {
  getOrCreateAISettings,
  generateWhatsAppAIReply,
  maybeReplyWithAI,
  loadImageCatalog,
};
