import { act } from "react";
import { createRoot } from "react-dom/client";
import WhatsAppVoiceCalls from "./WhatsAppVoiceCalls";

test("shows the selected Gemini provider and model alongside legacy OpenAI call history", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const actEnvironment = window.IS_REACT_ACT_ENVIRONMENT;
  window.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [
    { _id: "google", state: "completed", providerLabel: "Google Gemini Live", model: "gemini-3.8-live", voice: "Kore",
      createdAt: "2026-11-28T00:00:00Z", durationSeconds: 30, usage: { inputAudio: 100 }, estimatedCostUSD: 0.0003 },
    { _id: "openai", state: "completed", providerLabel: "OpenAI Realtime", model: "gpt-realtime-2.1", voice: "marin",
      createdAt: "2026-11-27T00:00:00Z", durationSeconds: 30 },
  ];
  const apiFetch = jest.fn(async (path) => path.endsWith("/settings") ? { data: {
    settings: { enabled: false, provider: "gemini", model: "gemini-3.8-live", voice: "Kore",
      greeting: "Namaste", languages: ["hi", "hinglish"], maxConcurrent: 3 },
    config: { configured: false, enabled: false, providerLabel: "Google Gemini Live",
      supportedModels: ["gemini-3.8-live", "gemini-3.8-live-extended-thinking"],
      supportedVoices: ["Kore", "Puck"], maxConcurrent: 3, maxDuration: 600 },
  } } : { data: { calls, hasMore: false } });
  const mount = () => root.render(<WhatsAppVoiceCalls apiFetch={apiFetch} />);

  try {
    await act(async () => { mount(); });
    expect(container.querySelector("input[readonly]").value).toBe("Google Gemini Live");
    expect(container.querySelector(".wa-voice-fields select").value).toBe("gemini-3.8-live");
    expect(container.querySelector('[role="switch"]').disabled).toBe(true);
    expect(container.textContent).toContain("Google Gemini Live · gemini-3.8-live · Kore");
    expect(container.textContent).toContain("Estimated API cost $0.0003");
    expect(container.textContent).toContain("OpenAI Realtime · gpt-realtime-2.1 · marin");
  } finally {
    act(() => root.unmount());
    window.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  }
});
