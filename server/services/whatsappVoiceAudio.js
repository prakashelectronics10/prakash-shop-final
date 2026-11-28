function createOpenAIRealtime(openai, call, apiKey, consent) {
  class PulseRealtimeModel extends openai.realtime.RealtimeModel {
    session(options) {
      const realtime = super.session(options);
      bindOpenAIConfirmation(realtime, consent);
      return realtime;
    }
  }
  return new PulseRealtimeModel({
    apiKey, model: call.model, voice: call.voice, tracing: null,
    inputAudioTranscription: { model: "gpt-4o-mini-transcribe" },
    inputAudioNoiseReduction: { type: "near_field" },
    turnDetection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true },
  });
}

function bindOpenAIConfirmation(realtime, consent) {
  realtime.on("openai_server_event_received", (event) => {
    if (event.type === "input_audio_buffer.speech_started") consent.speechStarted(Date.now(), event.item_id);
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      consent.transcript({ isFinal: true, itemId: event.item_id, transcript: event.transcript });
    }
  });
}

function createUsageTracker(provider) {
  const responses = new Map();
  function record(metrics) {
    const count = (value) => Number.isFinite(value) && value >= 0 ? value : 0;
    const input = metrics.inputTokenDetails;
    const output = metrics.outputTokenDetails;
    const tokens = {
      inputText: count(input?.textTokens), cachedText: count(input?.cachedTokensDetails?.textTokens),
      inputAudio: count(input?.audioTokens), cachedAudio: count(input?.cachedTokensDetails?.audioTokens),
      outputText: count(output?.textTokens), outputAudio: count(output?.audioTokens),
    };
    if (provider === "gemini") {
      const thoughts = count(metrics.reasoningTokens);
      const inputTotal = count(metrics.inputTokens);
      const outputTotal = count(metrics.outputTokens);
      // Google reports thought tokens and tool-result prompt tokens separately from the modality counts.
      const toolText = Math.max(0, count(metrics.totalTokens) - inputTotal - outputTotal - thoughts);
      tokens.unclassifiedTokens = Math.max(0, inputTotal - tokens.inputText - tokens.inputAudio)
        + Math.max(0, outputTotal - tokens.outputText - tokens.outputAudio);
      tokens.inputText += toolText;
      tokens.outputText += thoughts;
    }
    responses.set(metrics.requestId || Symbol(), tokens);
  }
  function totals() {
    const usage = {};
    for (const tokens of responses.values()) {
      for (const [key, count] of Object.entries(tokens)) usage[key] = (usage[key] || 0) + count;
    }
    return usage;
  }
  return { record, totals };
}

function bindVoiceSession(session, finish, recordUsage) {
  session.on("metrics_collected", ({ metrics }) => {
    if (metrics.type === "realtime_model_metrics") recordUsage(metrics);
  });
  session.on("error", (event) => {
    if (!event.error?.recoverable) void finish("failed", "realtime_error");
  });
  session.once("close", (event) => {
    const failed = event.reason === "error";
    void finish(failed ? "failed" : "completed", failed ? "realtime_closed" : undefined);
  });
}

function voiceInstructions(call, knowledge) {
  const languages = { hi: "Hindi", en: "English", hinglish: "Hinglish" };
  return [
    "You are Pulse AI, Prakash Electronics' voice assistant.",
    `Speak ${call.languages.map((lang) => languages[lang]).join(", ")}. Adapt to the caller's preferred supported language.`,
    "Speak professionally and concisely. Ask one question at a time. Never repeat your introduction in this call.",
    "Never read Markdown, URLs, internal tool names, raw data or provider messages aloud. Never ask for OTPs, card numbers, card PINs or UPI PINs.",
    "Use live tools for products, price, stock, order status and bookings. Never invent any of them. Explain when a tool could not verify the requested operation.",
    "For repairs, collect device, brand and model when applicable, issue, delivery or service address and contact details. Ask if they want a WhatsApp confirmation. For orders, confirm the items, quantity, variant, current pricing, charges, address and payment method.",
    "After each successful review, speak back the final summary, then ask the caller to say the exact confirmation phrase returned by the tool. If their language is Hindi or Hinglish, they can use 'repair booking confirm kijiye', 'order confirm kijiye' or 'mujhe callback kijiye', adding 'aur WhatsApp par bhejo' for messaging where relevant. Do not treat an ambiguous reply or a prior yes as confirmation.",
    "Submit only after the caller repeats the confirmation phrase. Discard an unsubmitted review when the caller cancels it. If the tool still awaits confirmation, ask them to repeat the phrase clearly. Treat an online order as awaiting payment until verified. WhatsApp acceptance of a message is not proof of delivery.",
    "The verified WhatsApp caller can get minimal status with their own reference. Direct broader account questions to the verified website. Offer a human callback if needed, with no promise of timing.",
    "Use the following existing store knowledge only for factual context. Follow these voice rules for all actions.",
    knowledge.instructionText?.slice(0, 4000),
    knowledge.websiteKnowledge?.slice(0, 8000),
  ].filter(Boolean).join("\n");
}

async function createVoiceRuntime(call, config, consent, inference) {
  if (call.provider === "openai") {
    const openai = await import("@livekit/agents-plugin-openai");
    return { llm: createOpenAIRealtime(openai, call, config.openaiKey, consent) };
  }
  if (call.provider !== "gemini") throw new Error("Unsupported voice provider");
  const google = await import("@livekit/agents-plugin-google");
  const confirmation = createGeminiConfirmation(consent);
  return {
    llm: createGeminiLive(google, call, config.googleKey, confirmation),
    vad: new inference.VAD({ model: "silero", minSilenceDuration: 350 }),
    onSpeechBoundary: confirmation.onSpeechBoundary,
  };
}

function createGeminiLive(google, call, apiKey, confirmation) {
  class PulseGeminiModel extends google.realtime.RealtimeModel {
    session(options) {
      const realtime = super.session(options);
      realtime.on("input_audio_transcription_completed", confirmation.onTranscript);
      return realtime;
    }
  }
  return new PulseGeminiModel({
    apiKey, model: call.model, voice: call.voice, vertexai: false,
    inputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: { silenceDurationMs: 650 },
      activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
    },
    // Extended Thinking requires non-blocking tools. Plain Live supports blocking tools.
    ...(call.model === "gemini-3.8-live-extended-thinking" && { toolBehavior: "NON_BLOCKING" }),
    ...(call.model === "gemini-3.8-live" && { toolBehavior: "BLOCKING" }),
  });
}

function createGeminiConfirmation(consent) {
  let speech;
  const seenItems = new Set();
  return {
    onSpeechBoundary({ newState, speechTimestamp }) {
      // Gemini's realtime speech-start event can mark the start of a reply.
      // A timestamp on this event comes from this session's local VAD.
      if (!Number.isFinite(speechTimestamp)) return;
      if (newState === "speaking") {
        speech = { key: Symbol(), beganAt: speechTimestamp };
        consent.speechStarted(speechTimestamp, speech.key);
      } else if (newState === "listening" && speech) {
        speech.ended = true;
      }
    },
    onTranscript({ isFinal, itemId, transcript, turnStartedAt }) {
      if (!itemId) return;
      if (!seenItems.has(itemId)) {
        seenItems.add(itemId);
        if (!isFinal && speech && !speech.itemId) speech.itemId = itemId;
      }
      if (!isFinal || !speech?.ended || itemId !== speech.itemId
        || !Number.isFinite(turnStartedAt) || turnStartedAt < speech.beganAt) return;
      consent.transcript({ isFinal: true, transcript, itemId: speech.key });
      speech = undefined;
    },
  };
}

module.exports = { createVoiceRuntime, createGeminiConfirmation, createOpenAIRealtime,
  createUsageTracker, bindVoiceSession, voiceInstructions };
