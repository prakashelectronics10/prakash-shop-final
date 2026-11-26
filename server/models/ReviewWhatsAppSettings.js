const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema({
  whatsappNumber: { type: String, required: true },
  verifiedAt: { type: Date, required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
});

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: "product-review-whatsapp" },
  enabled: { type: Boolean, default: false },
  generation: mongoose.Schema.Types.ObjectId,
  recipients: { type: [recipientSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("ReviewWhatsAppSettings", settingsSchema);
