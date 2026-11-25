const PROMPT_KEY = "prakash:pulse-ai-catalog-prompt";
const PROMPT_HASH = "#catalog-search";

export function openPulseAIWithSearchPrompt(value) {
  const prompt = value.trim();
  if (!prompt) return;
  window.sessionStorage.setItem(PROMPT_KEY, prompt);
  window.location.assign(`/pulse-ai${PROMPT_HASH}`);
}

export function readPulseAISearchPrompt() {
  if (typeof window === "undefined" || window.location.hash !== PROMPT_HASH) return "";
  try {
    return window.sessionStorage.getItem(PROMPT_KEY) || "";
  } catch {
    return "";
  }
}

export function consumePulseAISearchPrompt() {
  const prompt = readPulseAISearchPrompt();
  if (!prompt) return "";
  window.sessionStorage.removeItem(PROMPT_KEY);
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  return prompt;
}
