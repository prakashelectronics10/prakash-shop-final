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

const greetingMessageSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  type: z.enum(["text", "image", "interactive"]).optional().default("text"),
  bodyText: z.string().trim().max(1024).optional().default(""),
  footerText: z.string().trim().max(60).optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  imagePublicId: z.string().trim().optional().default(""),
  imageSourceUrl: z.string().trim().optional().default(""),
  imageUrls: z.array(z.string().trim()).max(8).optional().default([]),
  imagePublicIds: z.array(z.string().trim()).max(8).optional().default([]),
  buttons: z.array(greetingButtonSchema).max(3).optional().default([]),
}).superRefine((message, ctx) => {
  const hasContent = Boolean(
    String(message.bodyText || "").trim()
    || String(message.imageUrl || "").trim()
    || (message.imageUrls || []).length
    || (message.buttons || []).length,
  );
  if (!hasContent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each greeting step needs text, an image, or a button",
      path: ["bodyText"],
    });
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
  accessToken: z.union([
    z.literal(""),
    z.string().trim().min(20, "Access token is required").max(5000),
  ]).optional(),
});

const whatsAppGreetingSchema = z.object({
  accountId: z.string().trim().min(1, "WhatsApp account is required"),
  enabled: booleanValue.default(true),
  enableWelcomeMessage: booleanValue.default(true),
  iceBreakers: z.array(z.string().trim().max(80)).max(4).optional().default([]),
  messages: z.array(greetingMessageSchema).max(10).optional().default([]),
}).superRefine((value, ctx) => {
  if (!(value.messages || []).length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Add at least one greeting message",
      path: ["messages"],
    });
  }
});

const whatsAppAISettingsSchema = z.object({
  accountId: z.string().trim().min(1),
  enabled: booleanValue.default(true),
  systemPromptExtra: z.string().trim().max(4000).optional().default(""),
  sendProductImages: booleanValue.default(true),
  sendOfferImages: booleanValue.default(true),
  maxImagesPerReply: z.coerce.number().int().min(0).max(5).optional().default(3),
  allowButtons: booleanValue.default(true),
  pauseOnHumanReply: booleanValue.default(true),
});

const ogImageSchema = z.object({
  url: z.string().trim().url("Enter a valid URL"),
});

const sendTextSchema = z.object({
  conversationId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(4096),
});

const sendMediaSchema = z.object({
  conversationId: z.string().trim().min(1),
  mediaUrl: z.string().trim().url(),
  caption: z.string().trim().max(1024).optional().default(""),
  filename: z.string().trim().max(240).optional().default(""),
  mediaPublicId: z.string().trim().optional().default(""),
  mediaMimeType: z.string().trim().optional().default(""),
});

const conversationFlagsSchema = z.object({
  humanTakeover: booleanValue.optional(),
  aiEnabled: booleanValue.optional(),
});

module.exports = {
  whatsAppAccountSchema,
  whatsAppAccountUpdateSchema,
  whatsAppGreetingSchema,
  whatsAppAISettingsSchema,
  ogImageSchema,
  sendTextSchema,
  sendMediaSchema,
  conversationFlagsSchema,
};
