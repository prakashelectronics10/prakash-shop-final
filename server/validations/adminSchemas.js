const { z } = require("zod");
const { validateLinkAction } = require("../services/pulseAILinkActionService");

const optionalString = z.string().trim().optional().default("");
const nullableNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().nullable().optional().default(null));

const booleanValue = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const stringArray = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string().trim()).optional().default([]));

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const otpVerifySchema = z.object({
  challengeId: z.string().trim().min(12),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

const otpResendSchema = z.object({
  challengeId: z.string().trim().min(12),
});

const adminPermission = z.enum([
  "bookings",
  "orders",
  "pulseAI",
  "offers",
  "coupons",
  "shopHighlights",
  "services",
  "gallery",
  "testimonials",
  "featuredRepairs",
  "shopProducts",
  "autoSliderBanners",
  "projectParts",
  "projectSliders",
  "brandsSlider",
  "about",
  "footer",
  "webSettings",
  "notificationEmails",
  "invoices",
]);

const adminCreateSchema = z.object({
  name: z.string().trim().min(2, "Admin name is required"),
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "manager", "employee", "editor"]).optional().default("admin"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  tag: z.string().trim().min(2).optional().default("employee"),
  permissions: z.array(adminPermission).optional().default([]),
  adminAndroidAppAccess: booleanValue.default(false),
  receivePulseAIUnavailableAlerts: booleanValue.default(true),
});

const adminUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(["admin", "manager", "employee", "editor"]).optional(),
  tag: z.string().trim().min(2).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  permissions: z.array(adminPermission).optional(),
  adminAndroidAppAccess: booleanValue.optional(),
  receivePulseAIUnavailableAlerts: booleanValue.optional(),
  isActive: booleanValue.optional(),
});

const adminCreateVerifySchema = z.object({
  challengeId: z.string().trim().min(12),
  ownerOtp: z.string().trim().regex(/^\d{6}$/, "Main admin OTP must be 6 digits"),
  newAdminOtp: z.string().trim().regex(/^\d{6}$/, "New admin OTP must be 6 digits"),
});

const notificationEmailCreateSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  label: optionalString,
  isEnabled: booleanValue.default(true),
  receivePulseAIUnavailableAlerts: booleanValue.default(false),
});

const notificationEmailUpdateSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()).optional(),
  label: optionalString,
  isEnabled: booleanValue.default(true),
  receivePulseAIUnavailableAlerts: booleanValue.optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(2),
  slug: optionalString,
  description: optionalString,
  imageUrl: optionalString,
  isActive: booleanValue.default(true),
  displayOrder: z.coerce.number().optional().default(0),
});

const productSchema = z.object({
  title: z.string().trim().min(2),
  slug: optionalString,
  shortDescription: optionalString,
  description: optionalString,
  price: nullableNumber,
  originalPrice: nullableNumber,
  category: optionalString,
  categoryName: optionalString,
  iconName: optionalString.default("Plug"),
  iconImageUrl: optionalString,
  iconImagePublicId: optionalString,
  badge: optionalString,
  highlights: stringArray,
  imageUrl: optionalString,
  imagePublicId: optionalString,
  detail: z
    .object({
      eyebrow: optionalString,
      overview: optionalString,
      idealFor: stringArray,
      steps: stringArray,
      features: stringArray,
    })
    .optional()
    .default({}),
  ctaLabel: optionalString.default("Learn more"),
  isActive: booleanValue.default(true),
  isFeatured: booleanValue.default(false),
  displayOrder: z.coerce.number().optional().default(0),
});

const heroSchema = z.object({
  eyebrow: optionalString,
  title: optionalString,
  highlight: optionalString,
  titleSuffix: optionalString,
  description: optionalString,
  primaryCta: z.object({ label: optionalString, href: optionalString }).optional().default({}),
  secondaryCta: z.object({ label: optionalString, href: optionalString }).optional().default({}),
  image: z
    .object({
      url: optionalString,
      publicId: optionalString,
      alt: optionalString,
    })
    .optional()
    .default({}),
  trustBadges: z
    .array(z.object({ iconName: optionalString.default("ShieldCheck"), label: optionalString }))
    .optional()
    .default([]),
  ratingText: optionalString,
  floatingBadges: z.array(z.object({ label: optionalString, value: optionalString })).optional().default([]),
  isActive: booleanValue.default(true),
});

const offerSchema = z.object({
  title: z.string().trim().min(2),
  description: optionalString,
  code: optionalString,
  imageUrl: optionalString,
  imagePublicId: optionalString,
  ctaLabel: optionalString.default("Book now"),
  ctaHref: optionalString.default("#contact"),
  startsAt: z.string().datetime().nullable().optional().or(z.literal("")).default(null),
  endsAt: z.string().datetime().nullable().optional().or(z.literal("")).default(null),
  isActive: booleanValue.default(true),
  displayOrder: z.coerce.number().optional().default(0),
});

const contactSchema = z.object({
  phone: optionalString,
  alternatePhone: optionalString,
  whatsappNumber: optionalString,
  whatsappMessage: optionalString,
  email: optionalString,
  address: optionalString,
  shortAddress: optionalString,
  googleMapEmbedUrl: optionalString,
  streetViewEmbedUrl: optionalString,
  formspreeEndpoint: optionalString.default("https://formspree.io/f/xeeooogp"),
  socialLinks: z
    .array(z.object({
      title: optionalString,
      platform: optionalString,
      url: optionalString,
      iconName: optionalString,
      iconImageUrl: optionalString,
      iconImagePublicId: optionalString,
    }))
    .optional()
    .default([]),
});

const siteContentSchema = z.object({
  value: z.record(z.any()).or(z.array(z.any())),
});

const pulseAILinkActionSchema = z
  .object({
    enabled: booleanValue.optional().default(false),
    title: z.string().trim().max(120).optional().default(""),
    description: z.string().trim().max(240).optional().default(""),
    url: z.string().trim().max(2048).optional().default(""),
    type: z.enum(["auto", "internal", "external"]).optional().default("auto"),
    trigger: z.string().trim().max(500).optional().default(""),
    ctaLabel: z.string().trim().max(40).optional().default("Open Link"),
    openInNewTab: booleanValue.optional().default(true),
  })
  .superRefine((value, context) => {
    const result = validateLinkAction(value);
    if (!result.valid) {
      const message = result.message || "Invalid link action.";
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: message.toLowerCase().includes("title")
          ? ["title"]
          : message.toLowerCase().includes("trigger")
            ? ["trigger"]
            : ["url"],
      });
    }
  });

const pulseAIInstructionSchema = z.object({
  title: z.string().trim().min(2).max(120),
  instruction: z.string().trim().min(3).max(5000),
  scope: z.enum(["general", "products", "services", "website", "page"]).optional().default("general"),
  target: z.string().trim().max(160).optional().default(""),
  priority: z.coerce.number().int().min(0).max(1000).optional().default(100),
  isActive: booleanValue.optional().default(true),
  linkAction: pulseAILinkActionSchema.optional().default({ enabled: false }),
});

const pulseAIUnavailableDemandSettingsSchema = z.object({
  minimumUniqueCustomers: z.coerce.number().int().min(2).max(100),
  trackingPeriodHours: z.coerce.number().int().refine(
    (value) => [24, 168, 720].includes(value),
    "Choose a 24-hour, 7-day, or 30-day tracking period",
  ),
});

const nullableDate = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return value;
}, z.coerce.date().nullable().optional().default(null));

const couponSchema = z.object({
  title: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, "Use 3-32 letters, numbers, hyphens, or underscores"),
  description: z.string().trim().max(500).optional().default(""),
  visibility: z.enum(["public", "private"]).default("public"),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountValue: z.coerce.number().positive().max(100000),
  maxDiscountAmount: nullableNumber,
  minimumSubtotal: z.coerce.number().min(0).max(10000000).optional().default(0),
  appliesToAll: booleanValue.default(false),
  productIds: z.array(z.string().regex(/^[a-f\d]{24}$/i, "Invalid product selection")).optional().default([]),
  categories: stringArray,
  bannerImageUrl: optionalString,
  imageLayout: z.enum(["banner", "thumbnail"]).default("banner"),
  bannerImagePublicId: optionalString,
  startsAt: nullableDate,
  endsAt: nullableDate,
  isActive: booleanValue.default(true),
  displayOrder: z.coerce.number().int().min(-10000).max(10000).optional().default(0),
}).superRefine((value, context) => {
  if (value.discountType === "percent" && value.discountValue > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Percentage discount cannot exceed 100%" });
  }
  if (value.maxDiscountAmount !== null && Number(value.maxDiscountAmount) < 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxDiscountAmount"], message: "Maximum discount cannot be negative" });
  }
  if (!value.appliesToAll && !value.productIds.length && !value.categories.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["productIds"], message: "Choose products, categories, or all products" });
  }
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End date must be after start date" });
  }
});

const paginationSchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(24),
  category: optionalString,
  search: optionalString,
});

module.exports = {
  loginSchema,
  otpVerifySchema,
  otpResendSchema,
  adminCreateSchema,
  adminCreateVerifySchema,
  adminUpdateSchema,
  notificationEmailCreateSchema,
  notificationEmailUpdateSchema,
  categorySchema,
  productSchema,
  heroSchema,
  offerSchema,
  contactSchema,
  siteContentSchema,
  pulseAIInstructionSchema,
  pulseAIUnavailableDemandSettingsSchema,
  couponSchema,
  paginationSchema,
};
