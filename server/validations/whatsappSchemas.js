const { z } = require("zod");

const booleanValue = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const greetingButtonSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  type: z.enum(["url", "copy_code", "quick_reply"]),
  label: z.string().trim().min(1, "Button label is required").max(20),
  url: z.string().trim().url().optional().or(z.literal("")),
  code: z.string().trim().max(15).optional().default(""),
  payload: z.string().trim().max(80).optional().default(""),
}).superRefine((button, ctx) => {
  if (button.type === "url" && !button.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL is required for Go Now buttons", path: ["url"] });
  }
  if (button.type === "copy_code" && !String(button.code || "").trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Code is required for Copy Code buttons", path: ["code"] });
  }
});

const whatsAppAccountSchema = z.object({
  label: z.string().trim().min(2, "Account name is required").max(120),
  phoneNumberId: z.string().trim().min(5, "Phone number ID is required").max(80),
  businessAccountId: z.string().trim().min(5, "WABA ID is required").max(80),
  displayPhoneNumber: z.string().trim().max(32).optional().default(""),
  accessToken: z.string().trim().min(20, "Access token is required").max(5000),
  isActive: booleanValue.default(true),
  notes: z.string().trim().max(500).optional().default(""),
});

const whatsAppAccountUpdateSchema = whatsAppAccountSchema.extend({
  // Empty string keeps the existing token on update.
  accessToken: z.union([
    z.literal(""),
    z.string().trim().min(20, "Access token is required").max(5000),
  ]).optional(),
});

const whatsAppGreetingSchema = z.object({
  accountId: z.string().trim().min(1, "WhatsApp account is required"),
  enabled: booleanValue.default(true),
  bodyText: z.string().trim().max(1024).optional().default(""),
  footerText: z.string().trim().max(60).optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  imagePublicId: z.string().trim().optional().default(""),
  imageSourceUrl: z.string().trim().optional().default(""),
  buttons: z.array(greetingButtonSchema).max(3).optional().default([]),
}).superRefine((value, ctx) => {
  const hasContent = Boolean(
    String(value.bodyText || "").trim()
    || String(value.imageUrl || "").trim()
    || (value.buttons || []).length,
  );
  if (!hasContent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Add text, an image, or at least one button",
      path: ["bodyText"],
    });
  }

  const urlCount = (value.buttons || []).filter((button) => button.type === "url").length;
  const replyCount = (value.buttons || []).filter((button) => button.type !== "url").length;
  if (urlCount > 1 && replyCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "WhatsApp allows only one Go Now (URL) button per greeting",
      path: ["buttons"],
    });
  }
});

const ogImageSchema = z.object({
  url: z.string().trim().url("Enter a valid URL"),
});

module.exports = {
  whatsAppAccountSchema,
  whatsAppAccountUpdateSchema,
  whatsAppGreetingSchema,
  ogImageSchema,
};
