const InvoiceSetting = require("../models/InvoiceSetting");

const DEFAULT_INVOICE_SETTINGS = {
  business: {
    name: "Prakash Electronics",
    logoUrl: "/logo192.png",
    address: "Chitarpur, Ramgarh, Jharkhand",
    contactNumber: "",
    email: "support@prakashshop.in",
    websiteUrl: "https://www.prakashshop.in",
    gstNumber: "",
  },
  notes: "Thanks for choosing Us",
  signatureLabel: "Authorised Signature",
  signatureUrl: "",
};

async function getInvoiceSettings() {
  const saved = await InvoiceSetting.findOne({ key: "default" }).lean();
  return {
    ...DEFAULT_INVOICE_SETTINGS,
    ...(saved || {}),
    business: { ...DEFAULT_INVOICE_SETTINGS.business, ...(saved?.business || {}) },
  };
}

async function saveInvoiceSettings(input) {
  const saved = await InvoiceSetting.findOneAndUpdate(
    { key: "default" },
    { $set: { business: input.business, notes: input.notes, signatureLabel: input.signatureLabel, signatureUrl: input.signatureUrl } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return { ...DEFAULT_INVOICE_SETTINGS, ...saved, business: { ...DEFAULT_INVOICE_SETTINGS.business, ...saved.business } };
}

module.exports = { DEFAULT_INVOICE_SETTINGS, getInvoiceSettings, saveInvoiceSettings };
