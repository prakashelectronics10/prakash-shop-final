const mongoose = require("mongoose");

const whatsAppAISettingsSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppAccount",
      required: true,
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: true },
    systemPromptExtra: { type: String, default: "", trim: true, maxlength: 4000 },
    sendProductImages: { type: Boolean, default: true },
    sendOfferImages: { type: Boolean, default: true },
    maxImagesPerReply: { type: Number, default: 3, min: 0, max: 5 },
    allowButtons: { type: Boolean, default: true },
    pauseOnHumanReply: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WhatsAppAISettings", whatsAppAISettingsSchema);
