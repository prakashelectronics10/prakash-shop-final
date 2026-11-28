const geminiRates = [0.75, 3, 4.5, 12]; // USD per million text/audio input and text/audio output tokens

const providers = {
  gemini: {
    label: "Google Gemini Live",
    key: "googleKey",
    model: "geminiModel",
    models: [
      "gemini-3.8-live",
      "gemini-3.8-live-extended-thinking",
      "gemini-3.1-flash-live-preview",
      "gemini-2.5-flash-native-audio-preview-12-2025",
    ],
    voices: ["Kore", "Aoede", "Charon", "Fenrir", "Leda", "Orus", "Puck", "Zephyr"],
  },
  openai: {
    label: "OpenAI Realtime",
    key: "openaiKey",
    model: "openaiModel",
    voices: ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"],
  },
};

function voiceProvider(id) {
  return Object.hasOwn(providers, id) ? providers[id] : undefined;
}

function supportsModel(provider, model) {
  const spec = voiceProvider(provider);
  if (!spec || typeof model !== "string" || model.length > 80) return false;
  return spec.models ? spec.models.includes(model) : /^gpt-realtime(?:-[a-z0-9.-]+)?$/.test(model);
}

function resolveVoiceModel(config, saved = {}) {
  const provider = config.provider;
  const spec = voiceProvider(provider);
  // Legacy settings may contain an OpenAI model and voice. Keep them only with that provider.
  const useSaved = supportsModel(provider, saved.model);
  return {
    provider,
    model: useSaved ? saved.model : config[spec?.model],
    voice: useSaved && spec.voices.includes(saved.voice) ? saved.voice : spec?.voices[0],
  };
}

function callProvider(call) {
  if (voiceProvider(call.provider)) return call.provider;
  return Object.keys(providers).find((id) => supportsModel(id, call.model));
}

function estimatedCost({ provider, model, usage }) {
  if (!usage || !Object.keys(usage).length) return null;
  const { inputText = 0, cachedText = 0, inputAudio = 0, cachedAudio = 0, outputText = 0, outputAudio = 0 } = usage;
  if (provider === "gemini" && supportsModel(provider, model)) {
    if (usage.unclassifiedTokens) return null;
    const [textIn, audioIn, textOut, audioOut] = model.startsWith("gemini-2.5")
      ? [0.5, 3, 2, 12] : geminiRates;
    return (inputText * textIn + inputAudio * audioIn + outputText * textOut + outputAudio * audioOut) / 1_000_000;
  }
  if (provider === "openai") {
    const rates = {
      "gpt-realtime-2.1": [4, 0.4, 32, 0.4, 24, 64],
      "gpt-realtime-2.1-mini": [0.6, 0.06, 10, 0.3, 2.4, 20],
    }[model];
    if (rates) {
      const tokens = [Math.max(0, inputText - cachedText), cachedText,
        Math.max(0, inputAudio - cachedAudio), cachedAudio, outputText, outputAudio];
      return tokens.reduce((total, count, i) => total + count * rates[i], 0) / 1_000_000;
    }
  }
  return null;
}

module.exports = { voiceProvider, supportsModel, resolveVoiceModel, callProvider, estimatedCost };
