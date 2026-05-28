const Counter = require("../models/Counter");
const Invoice = require("../models/Invoice");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { calculateInvoiceTotals } = require("../utils/invoiceTotals");
const { generateInvoicePdf } = require("../services/invoicePdfService");

const DEFAULT_BUSINESS = {
  name: "Prakash Electronics",
  logoUrl: "",
  logoPublicId: "",
  address: "Chitarpur, Ramgarh, Jharkhand",
  gstNumber: "",
  contactNumber: "",
  email: "prakash@example.com",
  websiteUrl: "https://www.prakashshop.in",
};

const DEFAULT_CUSTOMER = {
  name: "Walk-in Customer",
  phone: "",
  email: "",
  address: "",
  customerId: "",
};
const ALLOWED_TEMPLATES = new Set(["minimal", "glass", "modern-blue", "dark", "corporate"]);

function publicPdfUrl(token) {
  return token ? `/api/invoices/public/${token}/pdf` : "";
}

function derivedStatus(invoice) {
  const status = invoice.paymentStatus || "pending";
  if (status === "paid") return "paid";
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
  if (dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < new Date()) return "overdue";
  return status;
}

function serializeInvoice(invoice) {
  const value = invoice.toObject ? invoice.toObject() : invoice;
  return {
    ...value,
    id: String(value._id || value.id || ""),
    status: derivedStatus(value),
    pdfUrl: value.pdfUrl || publicPdfUrl(value.publicAccessToken),
  };
}

function cleanObject(value = {}) {
  return value && typeof value === "object" ? value : {};
}

function safeDate(value, offsetDays = 0) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + offsetDays);
    return fallback;
  }
  return date;
}

function normalizeInvoiceItems(items = []) {
  const source = Array.isArray(items) && items.length ? items : [{ name: "Item", quantity: 1, unitPrice: 0, discount: 0, taxRate: 0 }];
  return source.map((item, index) => ({
    ...item,
    name: String(item?.name || `Item ${index + 1}`).trim(),
    quantity: Number(item?.quantity || 0),
    unitPrice: Number(item?.unitPrice || 0),
    discount: Number(item?.discount || 0),
    taxRate: Number(item?.taxRate || 0),
  }));
}

function buildInvoicePayload(body, adminId, existing = null) {
  const business = { ...DEFAULT_BUSINESS, ...cleanObject(existing?.business), ...cleanObject(body.business) };
  const customer = { ...DEFAULT_CUSTOMER, ...cleanObject(existing?.customer), ...cleanObject(body.customer) };
  const invoiceDate = safeDate(body.invoiceDate || existing?.invoiceDate);
  const dueDate = safeDate(body.dueDate || existing?.dueDate, 7);
  const calculated = calculateInvoiceTotals(normalizeInvoiceItems(body.items || existing?.items));

  const publicAccessToken = existing?.publicAccessToken;
  return {
    invoiceNumber: body.invoiceNumber || existing?.invoiceNumber,
    invoiceDate,
    dueDate,
    paymentStatus: ["paid", "pending", "partial"].includes(body.paymentStatus) ? body.paymentStatus : existing?.paymentStatus || "pending",
    business,
    customer,
    items: calculated.items,
    totals: calculated.totals,
    template: ALLOWED_TEMPLATES.has(body.template) ? body.template : existing?.template || "modern-blue",
    theme: body.theme || {},
    notes: body.notes || "",
    signatureLabel: body.signatureLabel || "Authorised Signature",
    publicAccessToken,
    pdfUrl: existing?.pdfUrl || publicPdfUrl(publicAccessToken),
    updatedBy: adminId,
  };
}

async function previewInvoiceNumber() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOne({ key: `invoice-${year}` }).lean();
  let seq = (counter?.seq || 0) + 1;
  let invoiceNumber = `INV-${year}-${String(seq).padStart(4, "0")}`;
  while (await Invoice.exists({ invoiceNumber })) {
    seq += 1;
    invoiceNumber = `INV-${year}-${String(seq).padStart(4, "0")}`;
  }
  return invoiceNumber;
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
  throw new AppError("Unable to generate a unique invoice number", 500);
}

function buildListFilter(query) {
  const filter = {};
  const search = String(query.search || "").trim();
  const customer = String(query.customer || "").trim();

  if (search) {
    const regex = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [
      { invoiceNumber: regex },
      { "customer.name": regex },
      { "customer.phone": regex },
      { "customer.email": regex },
      { "customer.customerId": regex },
    ];
  }
  if (customer) filter["customer.name"] = { $regex: customer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (query.status && query.status !== "all") {
    if (query.status === "overdue") {
      filter.paymentStatus = { $ne: "paid" };
      filter.dueDate = { $lt: new Date() };
    } else {
      filter.paymentStatus = query.status;
    }
  }
  if (query.dateFrom || query.dateTo) {
    filter.invoiceDate = {};
    if (query.dateFrom) filter.invoiceDate.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const end = new Date(query.dateTo);
      end.setHours(23, 59, 59, 999);
      filter.invoiceDate.$lte = end;
    }
  }
  return filter;
}

function sortSpec(sort) {
  if (sort === "oldest") return { invoiceDate: 1, createdAt: 1 };
  if (sort === "amountHigh") return { "totals.grandTotal": -1, invoiceDate: -1 };
  if (sort === "amountLow") return { "totals.grandTotal": 1, invoiceDate: -1 };
  if (sort === "dueDate") return { dueDate: 1, invoiceDate: -1 };
  return { invoiceDate: -1, createdAt: -1 };
}

const getNextInvoiceNumber = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { invoiceNumber: await previewInvoiceNumber() } });
});

const listInvoices = asyncHandler(async (req, res) => {
  const page = req.query.page;
  const limit = req.query.limit;
  const filter = buildListFilter(req.query);
  const skip = (page - 1) * limit;

  const [items, total, totalInvoices, paidInvoices, pendingInvoices, partialInvoices, overdueInvoices] = await Promise.all([
    Invoice.find(filter).sort(sortSpec(req.query.sort)).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
    Invoice.countDocuments(),
    Invoice.countDocuments({ paymentStatus: "paid" }),
    Invoice.countDocuments({ paymentStatus: "pending" }),
    Invoice.countDocuments({ paymentStatus: "partial" }),
    Invoice.countDocuments({ paymentStatus: { $ne: "paid" }, dueDate: { $lt: new Date() } }),
  ]);

  res.json({
    success: true,
    data: {
      items: items.map(serializeInvoice),
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: {
        totalInvoices,
        paidInvoices,
        pendingInvoices,
        partialInvoices,
        overdueInvoices,
      },
    },
  });
});

const createInvoice = asyncHandler(async (req, res) => {
  const invoiceNumber = await nextInvoiceNumber();
  const payload = buildInvoicePayload({ ...req.body, invoiceNumber }, req.admin?._id);
  payload.createdBy = req.admin?._id;

  const invoice = await Invoice.create(payload);
  invoice.pdfUrl = publicPdfUrl(invoice.publicAccessToken);
  await invoice.save();

  res.status(201).json({ success: true, data: serializeInvoice(invoice) });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).lean();
  if (!invoice) throw new AppError("Invoice not found", 404);
  res.json({ success: true, data: serializeInvoice(invoice) });
});

const updateInvoice = asyncHandler(async (req, res) => {
  const existing = await Invoice.findById(req.params.id);
  if (!existing) throw new AppError("Invoice not found", 404);
  const payload = buildInvoicePayload(req.body, req.admin?._id, existing);
  if (!payload.invoiceNumber) payload.invoiceNumber = existing.invoiceNumber;
  if (!payload.publicAccessToken) payload.publicAccessToken = existing.publicAccessToken;
  payload.pdfUrl = publicPdfUrl(payload.publicAccessToken);

  Object.assign(existing, payload);
  existing.pdfUrl = publicPdfUrl(existing.publicAccessToken);
  await existing.save();
  res.json({ success: true, data: serializeInvoice(existing) });
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new AppError("Invoice not found", 404);
  await invoice.deleteOne();
  res.json({ success: true });
});

const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new AppError("Invoice not found", 404);
  invoice.pdfUrl = publicPdfUrl(invoice.publicAccessToken);
  await invoice.save();
  const pdf = generateInvoicePdf(invoice);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

const publicInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ publicAccessToken: req.params.token });
  if (!invoice) throw new AppError("Invoice PDF not found", 404);
  const pdf = generateInvoicePdf(invoice);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(pdf);
});

module.exports = {
  createInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  getInvoice,
  getNextInvoiceNumber,
  listInvoices,
  publicInvoicePdf,
  updateInvoice,
};
