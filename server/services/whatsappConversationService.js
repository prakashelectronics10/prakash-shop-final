const WhatsAppConversation = require("../models/WhatsAppConversation");
const WhatsAppMessage = require("../models/WhatsAppMessage");

function previewFromPayload({ text, type, mediaFilename }) {
  if (text) return String(text).slice(0, 240);
  if (type === "image") return "📷 Image";
  if (type === "document") return `📄 ${mediaFilename || "Document"}`;
  if (type === "interactive") return "Interactive message";
  return type ? String(type) : "Message";
}

async function upsertConversation({
  accountId,
  customerWaId,
  customerName = "",
  direction,
  preview,
  bumpUnread = false,
}) {
  const update = {
    $set: {
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      lastDirection: direction,
    },
    $setOnInsert: {
      account: accountId,
      customerWaId,
      aiEnabled: true,
      humanTakeover: false,
    },
  };

  if (customerName) {
    update.$set.customerName = customerName;
  }
  if (bumpUnread) {
    update.$inc = { unreadCount: 1 };
  }

  return WhatsAppConversation.findOneAndUpdate(
    { account: accountId, customerWaId },
    update,
    { upsert: true, new: true },
  );
}

async function recordMessage({
  accountId,
  conversationId,
  customerWaId,
  direction,
  sender,
  type = "text",
  text = "",
  mediaUrl = "",
  mediaMimeType = "",
  mediaFilename = "",
  mediaPublicId = "",
  buttons = [],
  waMessageId = "",
  status = "sent",
  meta = {},
  customerName = "",
}) {
  const conversation = conversationId
    ? await WhatsAppConversation.findById(conversationId)
    : await upsertConversation({
      accountId,
      customerWaId,
      customerName,
      direction,
      preview: previewFromPayload({ text, type, mediaFilename }),
      bumpUnread: direction === "inbound",
    });

  if (!conversation) {
    throw new Error("Unable to resolve WhatsApp conversation");
  }

  if (conversationId) {
    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = previewFromPayload({ text, type, mediaFilename });
    conversation.lastDirection = direction;
    if (customerName && !conversation.customerName) conversation.customerName = customerName;
    if (direction === "inbound") conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await conversation.save();
  }

  if (waMessageId) {
    const existing = await WhatsAppMessage.findOne({ waMessageId }).lean();
    if (existing) return { conversation, message: existing, duplicate: true };
  }

  const message = await WhatsAppMessage.create({
    account: accountId,
    conversation: conversation._id,
    customerWaId,
    direction,
    sender,
    type,
    text,
    mediaUrl,
    mediaMimeType,
    mediaFilename,
    mediaPublicId,
    buttons,
    waMessageId,
    status,
    meta,
  });

  return { conversation, message, duplicate: false };
}

async function markConversationRead(conversationId) {
  return WhatsAppConversation.findByIdAndUpdate(
    conversationId,
    { $set: { unreadCount: 0 } },
    { new: true },
  );
}

function serializeConversation(doc) {
  const item = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: String(item._id),
    _id: String(item._id),
    accountId: String(item.account),
    customerWaId: item.customerWaId,
    customerName: item.customerName || "",
    lastMessageAt: item.lastMessageAt,
    lastMessagePreview: item.lastMessagePreview || "",
    lastDirection: item.lastDirection,
    unreadCount: item.unreadCount || 0,
    aiEnabled: item.aiEnabled !== false,
    humanTakeover: Boolean(item.humanTakeover),
    greetingSentAt: item.greetingSentAt,
    updatedAt: item.updatedAt,
  };
}

function serializeMessage(doc) {
  const item = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: String(item._id),
    _id: String(item._id),
    conversationId: String(item.conversation),
    customerWaId: item.customerWaId,
    direction: item.direction,
    sender: item.sender,
    type: item.type,
    text: item.text || "",
    mediaUrl: item.mediaUrl || "",
    mediaMimeType: item.mediaMimeType || "",
    mediaFilename: item.mediaFilename || "",
    buttons: item.buttons || [],
    waMessageId: item.waMessageId || "",
    status: item.status,
    createdAt: item.createdAt,
  };
}

module.exports = {
  upsertConversation,
  recordMessage,
  markConversationRead,
  serializeConversation,
  serializeMessage,
  previewFromPayload,
};
