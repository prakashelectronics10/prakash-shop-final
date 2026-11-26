const Counter = require("../models/Counter");
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const env = require("../config/env");
const { calculateInvoiceTotals, toMoneyNumber } = require("../utils/invoiceTotals");
const { PLATFORM_FEE_SLUG } = require("./additionalChargeService");
const { getInvoiceSettings } = require("./invoiceSettingService");
const { generateInvoicePdf } = require("./invoicePdfService");

const BLUE_THEME = {
  primaryColor: "#2563eb",
  accentColor: "#38bdf8",
  buttonColor: "#1d4ed8",
  headerColor: "#020617",
  textColor: "#0f172a",
  backgroundColor: "#ffffff",
};

const ORDER_INVOICE_THEMES = new Map([
  ["blue", BLUE_THEME],
  ["emerald", { primaryColor: "#059669", accentColor: "#5eead4", buttonColor: "#047857", headerColor: "#052e2b", textColor: "#10201d", backgroundColor: "#f8fffd" }],
  ["ruby", { primaryColor: "#e11d48", accentColor: "#fb7185", buttonColor: "#be123c", headerColor: "#3f0713", textColor: "#1f1115", backgroundColor: "#fff8fa" }],
  ["gold", { primaryColor: "#ca8a04", accentColor: "#facc15", buttonColor: "#a16207", headerColor: "#241a05", textColor: "#1f1a10", backgroundColor: "#fffdf5" }],
  ["violet", { primaryColor: "#7c3aed", accentColor: "#c084fc", buttonColor: "#6d28d9", headerColor: "#160f2e", textColor: "#151124", backgroundColor: "#fbf8ff" }],
]);

function platformFeeCharge(order) {
  return order?.additionalCharges?.find((charge) => charge.slug === PLATFORM_FEE_SLUG);
}

async function invoiceForPdf(invoice) {
  const printable = invoice.toObject();
  if (printable.totals?.platformFee != null || !printable.orderId
    || !printable.items.some((item) => /^platform fee$/i.test(item.name))) return printable;

  const order = await Order.findOne({ orderId: printable.orderId }).select("additionalCharges").lean();
  const charge = platformFeeCharge(order);
  if (!charge?.amount) return printable;
  const index = printable.items.findLastIndex((item) => item.name === charge.name
    && item.quantity === 1 && item.unitPrice === charge.amount && item.totalPrice === charge.amount);
  if (index === -1) return printable;
  printable.items.splice(index, 1);
  printable.totals = { ...printable.totals,
    subtotal: toMoneyNumber(printable.totals.subtotal - charge.amount), platformFee: charge.amount };
  return printable;
}

async function getOrderInvoicePdf(invoice, requestedTheme = "blue") {
  const theme = ORDER_INVOICE_THEMES.get(requestedTheme) || BLUE_THEME;
  const printable = await invoiceForPdf(invoice);
  const feeLayout = printable.totals?.platformFee > 0;
  const layout = 2;
  const render = () => generateInvoicePdf(
    { ...printable, template: "minimal", theme },
    { requireBranding: true },
  );
  if (theme !== BLUE_THEME) return render();

  const readSaved = () => Invoice.findById(invoice._id).select("+checkoutPdf +checkoutPdfLayout");
  const existing = await readSaved();
  if (existing?.checkoutPdf?.length && (!feeLayout || existing.checkoutPdfLayout === layout)) return existing.checkoutPdf;

  const pdf = await render();
  // A browser download and WhatsApp delivery can race. Both use the winning file.
  const saved = await Invoice.findOneAndUpdate(
    { _id: invoice._id, ...(feeLayout
      ? { $or: [{ checkoutPdf: { $exists: false } }, { checkoutPdfLayout: { $ne: layout } }] }
      : { checkoutPdf: { $exists: false } }) },
    { $set: { checkoutPdf: pdf, ...(feeLayout ? { checkoutPdfLayout: layout } : {}) } },
    { new: true, timestamps: false },
  ).select("+checkoutPdf");
  const checkoutPdf = saved?.checkoutPdf || (await readSaved())?.checkoutPdf;
  if (!checkoutPdf?.length) throw new Error("Unable to save the checkout invoice PDF");
  return checkoutPdf;
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { key: `invoice-${year}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    const invoiceNumber = `INV-${year}-${String(counter.seq).padStart(4, "0")}`;
    if (!(await Invoice.exists({ invoiceNumber }))) return invoiceNumber;
  }
  throw new Error("Unable to generate a unique invoice number");
}

function orderInvoiceItems(order) {
  const products = (order.items || []).map((item) => ({
    name: [item.productName, item.variantSummary].filter(Boolean).join(" — "),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: Math.max(0, Number(item.lineTotal || 0) - Number(item.discountedLineTotal ?? item.lineTotal ?? 0)),
    // Website prices already include any applicable product tax.
    taxRate: 0,
  }));
  const charges = (order.additionalCharges || []).filter((charge) =>
    charge.slug !== PLATFORM_FEE_SLUG && Number(charge.amount) > 0).map((charge) => ({
    name: charge.name,
    quantity: 1,
    unitPrice: charge.amount,
    discount: 0,
    taxRate: 0,
  }));
  return [...products, ...charges];
}

async function createOrderInvoice(order) {
  if (!order || order.paymentStatus !== "paid") return null;
  const orderId = String(order.orderId || "").trim().toUpperCase();
  if (!orderId) return null;

  const existing = await Invoice.findOne({ orderId });
  if (existing) return existing;
  const settings = await getInvoiceSettings();

  const invoiceDate = order.paidAt || new Date();
  const dueDate = new Date(invoiceDate);
  const customer = order.customer || {};
  const customerAddress = [
    customer.address,
    customer.landmark ? `Landmark: ${customer.landmark}` : "",
    customer.pincode ? `PIN ${customer.pincode}` : "",
  ].filter(Boolean).join(", ");
  const items = orderInvoiceItems(order);
  const calculated = calculateInvoiceTotals(items);
  const platformFee = toMoneyNumber(platformFeeCharge(order)?.amount);
  calculated.totals.platformFee = platformFee;
  calculated.totals.grandTotal = toMoneyNumber(calculated.totals.grandTotal + platformFee);
  const invoiceNumber = await nextInvoiceNumber();

  try {
    return await Invoice.create({
      orderId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentStatus: "paid",
      business: { ...settings.business, contactNumber: settings.business.contactNumber || env.mail.supportPhone || "" },
      customer: {
        name: customer.name || "Customer",
        phone: customer.phone || "",
        whatsappNumber: customer.whatsappNumber || customer.phone || "",
        address: customerAddress,
      },
      transactionId: order.razorpayPaymentId || "",
      items: calculated.items,
      totals: calculated.totals,
      template: "minimal",
      theme: BLUE_THEME,
      notes: settings.notes,
      signatureLabel: settings.signatureLabel,
      signatureUrl: settings.signatureUrl,
      pdfUrl: "",
    });
  } catch (error) {
    // A payment verification callback and Razorpay webhook may arrive together.
    if (error.code === 11000) {
      const racedInvoice = await Invoice.findOne({ orderId });
      if (racedInvoice) return racedInvoice;
    }
    throw error;
  }
}

function orderInvoicePath(orderId) {
  return `/orders/track/${encodeURIComponent(String(orderId || ""))}/invoice.pdf`;
}

function ensureOrderInvoiceIndexes() {
  return Invoice.collection.createIndex({ orderId: 1 }, { unique: true, sparse: true });
}

module.exports = { createOrderInvoice, ensureOrderInvoiceIndexes, getOrderInvoicePdf, orderInvoicePath };
