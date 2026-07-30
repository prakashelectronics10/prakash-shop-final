const { z } = require("zod");

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
  "offers",
  "services",
  "gallery",
  "testimonials",
  "featuredRepairs",
  "shopProducts",
  "autoSliderBanners",
  "trendingBanners",
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
});

const adminUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(["admin", "manager", "employee", "editor"]).optional(),
  tag: z.string().trim().min(2).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  permissions: z.array(adminPermission).optional(),
  adminAndroidAppAccess: booleanValue.optional(),
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
});

const notificationEmailUpdateSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()).optional(),
  label: optionalString,
  isEnabled: booleanValue.default(true),
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
  paginationSchema,
};
