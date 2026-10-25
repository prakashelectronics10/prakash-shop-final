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
