const mongoose = require("mongoose");

const contactInfoSchema = new mongoose.Schema(
  {
    phone: { type: String, default: "" },
    alternatePhone: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    whatsappMessage: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    shortAddress: { type: String, default: "" },
    googleMapEmbedUrl: { type: String, default: "" },
    streetViewEmbedUrl: { type: String, default: "" },
    formspreeEndpoint: { type: String, default: "https://formspree.io/f/xeeooogp" },
    socialLinks: [
      {
        title: { type: String, default: "" },
        platform: { type: String, default: "" },
        url: { type: String, default: "" },
        iconName: { type: String, default: "" },
        iconImageUrl: { type: String, default: "" },
        iconImagePublicId: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("ContactInfo", contactInfoSchema);
