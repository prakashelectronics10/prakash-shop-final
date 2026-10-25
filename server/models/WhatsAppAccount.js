const mongoose = require("mongoose");

const whatsAppAccountSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    phoneNumberId: { type: String, required: true, trim: true, unique: true, index: true },
    businessAccountId: { type: String, required: true, trim: true, index: true },
    displayPhoneNumber: { type: String, default: "", trim: true },
    accessToken: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WhatsAppAccount", whatsAppAccountSchema);
