const { z } = require("zod");

const optionalString = z.string().trim().optional().default("");
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a valid hex color");
const optionalEmail = z
  .preprocess((value) => String(value || "").trim(), z.union([z.string().email(), z.literal("")]))
  .transform((value) => String(value || "").toLowerCase());

const dateString = z.preprocess((value) => {
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}, z.date());

const invoiceItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  productName: optionalString,
  serviceName: optionalString,
  quantity: z.coerce.number().min(0.01).default(1),
  unitPrice: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
}).superRefine((item, context) => {
  if (item.discount > item.quantity * item.unitPrice) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discount"],
      message: "Discount cannot exceed the item price",
    });
  }
});

const invoiceNumberSchema = z.union([
  z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9/_-]{2,39}$/, "Use a valid invoice number"),
  z.literal(""),
]);
const businessSchema = z.object({
  name: z.string().trim().min(2, "Business name is required"),
  logoUrl: optionalString,
  logoPublicId: optionalString,
  address: z.string().trim().min(4, "Business address is required"),
  gstNumber: optionalString,
  contactNumber: z.string().trim().min(6, "Contact number is required"),
  email: z.string().email().transform((value) => value.toLowerCase()),
  websiteUrl: optionalString,
});
const customerSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required"),
  phone: z.string().trim().min(6, "Phone number is required"),
  email: optionalEmail,
  address: z.string().trim().min(4, "Customer address is required"),
  customerId: optionalString,
});
const themeSchema = z.object({
  primaryColor: hexColor.default("#2563eb"),
  accentColor: hexColor.default("#38bdf8"),
  buttonColor: hexColor.default("#0f172a"),
  headerColor: hexColor.default("#020617"),
  textColor: hexColor.default("#0f172a"),
  backgroundColor: hexColor.default("#ffffff"),
});
const templateSchema = z.enum(["minimal", "glass", "modern-blue", "dark", "corporate"]);

function validateDateOrder(invoice, context) {
  if (invoice.invoiceDate && invoice.dueDate && invoice.dueDate < invoice.invoiceDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dueDate"],
      message: "Due date cannot be before invoice date",
    });
  }
}

const invoiceSchema = z.object({
  invoiceNumber: invoiceNumberSchema.optional().default(""),
  invoiceDate: dateString,
  dueDate: dateString,
  paymentStatus: z.enum(["paid", "pending", "partial"]).default("pending"),
  business: businessSchema,
  customer: customerSchema,
  items: z.array(invoiceItemSchema).min(1, "Add at least one invoice item"),
  template: templateSchema.default("minimal"),
  theme: themeSchema.optional().default({}),
  notes: optionalString,
  signatureLabel: optionalString.default("Authorised Signature"),
}).superRefine(validateDateOrder);

const invoiceUpdateSchema = z.object({
  invoiceNumber: invoiceNumberSchema.optional(),
  invoiceDate: dateString.optional(),
  dueDate: dateString.optional(),
  paymentStatus: z.enum(["paid", "pending", "partial"]).optional(),
  business: businessSchema.partial().optional(),
  customer: customerSchema.partial().optional(),
  items: z.array(invoiceItemSchema).min(1, "Add at least one invoice item").optional(),
  template: templateSchema.optional(),
  theme: themeSchema.partial().optional(),
  notes: z.string().trim().optional(),
  signatureLabel: z.string().trim().optional(),
}).superRefine(validateDateOrder);

const invoiceQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(24),
  search: optionalString,
  status: z.enum(["all", "paid", "pending", "partial", "overdue"]).optional().default("all"),
  customer: optionalString,
  dateFrom: optionalString,
  dateTo: optionalString,
  sort: z.enum(["newest", "oldest", "amountHigh", "amountLow", "dueDate"]).optional().default("newest"),
});

module.exports = { invoiceSchema, invoiceUpdateSchema, invoiceQuerySchema };
