const mongoose = require("mongoose");

const whatsAppMessageSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppAccount",
      required: true,
      index: true,
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppConversation",
      required: true,
      index: true,
    },
    customerWaId: { type: String, required: true, trim: true, index: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true, index: true },
    sender: {
      type: String,
      enum: ["customer", "ai", "admin", "system"],
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "document", "interactive", "button", "audio", "video", "sticker", "reaction", "unknown"],
      default: "text",
    },
    text: { type: String, default: "", trim: true },
    mediaUrl: { type: String, default: "", trim: true },
    mediaMimeType: { type: String, default: "", trim: true },
    mediaFilename: { type: String, default: "", trim: true },
    mediaPublicId: { type: String, default: "", trim: true },
    buttons: { type: Array, default: [] },
    waMessageId: { type: String, default: "", trim: true, index: true },
    status: { type: String, enum: ["pending", "sent", "delivered", "read", "failed"], default: "sent" },
    // Customer / system reactions on this message (WhatsApp-style)
    reactions: {
      type: [{
        emoji: { type: String, trim: true },
        fromWaId: { type: String, trim: true },
        fromName: { type: String, trim: true, default: "" },
        at: { type: Date, default: Date.now },
      }],
      default: [],
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

whatsAppMessageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model("WhatsAppMessage", whatsAppMessageSchema);
