const mongoose = require("mongoose");

const whatsAppGreetingLogSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppAccount",
      required: true,
      index: true,
    },
    customerWaId: { type: String, required: true, trim: true, index: true },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

whatsAppGreetingLogSchema.index({ account: 1, customerWaId: 1 }, { unique: true });

module.exports = mongoose.model("WhatsAppGreetingLog", whatsAppGreetingLogSchema);
