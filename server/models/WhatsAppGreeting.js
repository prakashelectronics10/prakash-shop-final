const mongoose = require("mongoose");

const greetingButtonSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["url", "copy_code", "quick_reply"],
      required: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 20 },
    url: { type: String, default: "", trim: true },
    code: { type: String, default: "", trim: true, maxlength: 15 },
    payload: { type: String, default: "", trim: true, maxlength: 80 },
  },
  { _id: false },
);

const greetingMessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["text", "image", "interactive"],
      default: "text",
    },
    bodyText: { type: String, default: "", trim: true, maxlength: 1024 },
    footerText: { type: String, default: "", trim: true, maxlength: 60 },
    imageUrl: { type: String, default: "", trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    imageSourceUrl: { type: String, default: "", trim: true },
    // Extra images for this step (sent as separate image messages after the main payload)
    imageUrls: { type: [String], default: [] },
    imagePublicIds: { type: [String], default: [] },
    buttons: { type: [greetingButtonSchema], default: [] },
  },
  { _id: false },
);

const whatsAppGreetingSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppAccount",
      required: true,
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: true, index: true },
    // Meta Conversational Components — fires request_welcome when chat opens first time
    enableWelcomeMessage: { type: Boolean, default: true },
    iceBreakers: { type: [String], default: [] },
    // Ordered multi-message greeting sequence
    messages: { type: [greetingMessageSchema], default: [] },
    // Legacy single-message fields (kept for migration / backward compat)
    bodyText: { type: String, default: "", trim: true, maxlength: 1024 },
    footerText: { type: String, default: "", trim: true, maxlength: 60 },
    imageUrl: { type: String, default: "", trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    imageSourceUrl: { type: String, default: "", trim: true },
    buttons: { type: [greetingButtonSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WhatsAppGreeting", whatsAppGreetingSchema);
