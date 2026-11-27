const PROMPT_KEY = "prakash:pulse-ai-catalog-prompt";
const PROMPT_HASH = "#catalog-search";
const GREETING_HASH = "#say-hello";

export const PULSE_AI_GREETING_PATH = `/pulse-ai${GREETING_HASH}`;

export function openPulseAIWithSearchPrompt(value) {
  const prompt = value.trim();
  if (!prompt) return;
  window.sessionStorage.setItem(PROMPT_KEY, prompt);
  window.location.assign(`/pulse-ai${PROMPT_HASH}`);
}

export function readPulseAIStartupPrompt() {
  if (typeof window === "undefined") return "";
  if (window.location.hash === GREETING_HASH) return "Hi Pulse AI! What can you help me with?";
  if (window.location.hash !== PROMPT_HASH) return "";
  try {
    return window.sessionStorage.getItem(PROMPT_KEY) || "";
  } catch {
    return "";
  }
}

export function consumePulseAIStartupPrompt() {
  const prompt = readPulseAIStartupPrompt();
  if (!prompt) return "";
  if (window.location.hash === PROMPT_HASH) window.sessionStorage.removeItem(PROMPT_KEY);
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return prompt;
}
