const { z } = require("zod");
const env = require("../config/env");
const Call = require("../models/WhatsAppVoiceCall");
const Settings = require("../models/WhatsAppVoiceSettings");
const voice = require("../services/whatsappVoiceService");
const { voiceProvider, supportsModel, callProvider, estimatedCost } = require("../services/whatsappVoiceModels");
const catchAsync = require("../utils/asyncHandler");

const states = [...voice.LIVE, "completed", "missed", "failed"];
const filters = z.object({
  state: z.enum(states).optional(),
  callback: z.enum(["requested", "resolved"]).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
});
const settingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["gemini", "openai"]).optional(),
  model: z.string().trim().min(1).max(80),
  voice: z.string().trim().min(1).max(40),
  greeting: z.string().trim().min(1).max(500),
  languages: z.array(z.enum(voice.LANGUAGES)).min(1).max(3).refine((list) => new Set(list).size === list.length),
  maxConcurrent: z.number().int().min(1).max(env.pulseVoice.maxConcurrent),
}).strict();

function settingsResponse(settings) {
  const configured = voice.configurationReady();
  const spec = voiceProvider(settings.provider);
  return { settings, config: { configured, enabled: env.pulseVoice.enabled,
    providerLabel: spec?.label, supportedVoices: spec?.voices || [], supportedModels: spec?.models,
    maxConcurrent: env.pulseVoice.maxConcurrent, maxDuration: env.pulseVoice.maxDuration } };
}

exports.getVoiceSettings = catchAsync(async (_req, res) => {
  res.json({ success: true, data: settingsResponse(await voice.getSettings()) });
});

exports.updateVoiceSettings = catchAsync(async (req, res) => {
  const input = settingsSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ success: false, message: "Check the voice settings and try again." });
  const { provider, ...settings } = input.data;
  const selected = env.pulseVoice.provider;
  if ((provider && provider !== selected) || !supportsModel(selected, settings.model)
    || !voiceProvider(selected)?.voices.includes(settings.voice)) {
    return res.status(400).json({ success: false, message: "Choose a model and voice supported by the server’s selected provider." });
  }
  if (input.data.enabled && (!env.pulseVoice.enabled || !voice.configurationReady())) {
    return res.status(409).json({ success: false, message: "Enable and configure WhatsApp voice calling on the server first." });
  }
  await Settings.updateOne({ _id: voice.SETTINGS_ID }, { $set: settings }, { upsert: true });
  res.json({ success: true, data: settingsResponse(await voice.getSettings()) });
});

exports.listVoiceCalls = catchAsync(async (req, res) => {
  const input = filters.safeParse(req.query);
  if (!input.success) return res.status(400).json({ success: false, message: "Invalid call filter." });
  const { page, ...filter } = input.data;
  const limit = 25;
  const rows = await Call.find(filter)
    .select("caller direction state provider model voice startedAt endedAt durationSeconds errorCode callback callbackAt summaryTopic usage createdAt")
    .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1).lean();
  res.json({ success: true, data: { calls: rows.slice(0, limit).map((call) => {
    const provider = callProvider(call);
    return { ...call, provider, providerLabel: voiceProvider(provider)?.label,
      estimatedCostUSD: estimatedCost({ ...call, provider }) };
  }), hasMore: rows.length > limit && page < 200 } });
});

exports.resolveVoiceCallback = catchAsync(async (req, res) => {
  if (!/^[\w.+/=:-]{1,256}$/.test(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid call reference." });
  }
  const result = await Call.updateOne({ _id: req.params.id, callback: "requested" }, { $set: { callback: "resolved" } });
  if (!result.modifiedCount) return res.status(404).json({ success: false, message: "Callback request is no longer open." });
  res.json({ success: true });
});
