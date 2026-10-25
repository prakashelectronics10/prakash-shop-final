const mongoose = require("mongoose");

const whatsAppConversationSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppAccount",
      required: true,
      index: true,
    },
    customerWaId: { type: String, required: true, trim: true, index: true },
    customerName: { type: String, default: "", trim: true },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: "", trim: true, maxlength: 240 },
    lastDirection: { type: String, enum: ["inbound", "outbound"], default: "inbound" },
    unreadCount: { type: Number, default: 0, min: 0 },
    aiEnabled: { type: Boolean, default: true },
    humanTakeover: { type: Boolean, default: false },
    conversationMemory: { type: mongoose.Schema.Types.Mixed, default: {} },
    greetingSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

whatsAppConversationSchema.index({ account: 1, customerWaId: 1 }, { unique: true });
whatsAppConversationSchema.index({ account: 1, lastMessageAt: -1 });

module.exports = mongoose.model("WhatsAppConversation", whatsAppConversationSchema);
