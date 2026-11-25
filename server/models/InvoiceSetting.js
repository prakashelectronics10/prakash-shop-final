const mongoose = require("mongoose");

const invoiceSettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "default" },
  business: {
    name: { type: String, trim: true, default: "Prakash Electronics" },
    logoUrl: { type: String, trim: true, default: "/logo192.png" },
    address: { type: String, trim: true, default: "Chitarpur, Ramgarh, Jharkhand" },
    contactNumber: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "support@prakashshop.in" },
    websiteUrl: { type: String, trim: true, default: "https://www.prakashshop.in" },
    gstNumber: { type: String, trim: true, default: "" },
  },
  notes: { type: String, trim: true, default: "Thanks for choosing Us" },
  signatureLabel: { type: String, trim: true, default: "Authorised Signature" },
  signatureUrl: { type: String, trim: true, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("InvoiceSetting", invoiceSettingSchema);
