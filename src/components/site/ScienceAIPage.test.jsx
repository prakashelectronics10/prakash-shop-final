import { act } from "react";
import { createRoot } from "react-dom/client";
import { apiRequest } from "../../api/client";
import { CartProvider } from "../../context/CartContext";
import { ScienceAIPage } from "./ScienceAIPage";

jest.mock("./PulseOrbAnimation", () => ({ PulseOrbAnimation: () => null }));
jest.mock("../../api/client", () => ({
  ...jest.requireActual("../../api/client"),
  apiRequest: jest.fn(),
}));

test("renders saved Pulse AI link chips without a SiteDataProvider", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const storageKey = "prakash:pulse-ai-sessions:v2";
  const oldActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const oldScrollIntoView = HTMLElement.prototype.scrollIntoView;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  sessionStorage.setItem(storageKey, JSON.stringify({
    activeSessionId: "test-chat",
    sessions: [{
      id: "test-chat",
      messages: [
        { role: "user", text: "Show me the shop links." },
        {
          role: "ai",
          text: [
            "[Book Repair](/booking) · **[Service details](/learn-more?service=ac_repair)** · https://example.com/user_guide. Or go to /contact. [Invalid](javascript:alert(1))",
            "- **Instagram:** [Prakash Electronics Instagram](https://www.instagram.com/prakash_electronics1?ps",
            "",
            "  ln=example%2Bvalue&source=chat)",
            "- Keep this as a separate bullet.",
          ].join("\n"),
          linkCards: [
            { title: "Shop Products", url: "/products" },
            { title: "Home", url: "/", imageUrl: "https://example.com/shop-og.jpg" },
          ],
        },
      ],
    }],
  }));

  try {
    act(() => root.render(<CartProvider><ScienceAIPage /></CartProvider>));

    const chips = [...container.querySelectorAll(".ai-website-link-chip")];
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute("href")])).toEqual([
      ["Shop Products", "/products"],
      ["Home", "/"],
    ]);
    expect(chips[0].querySelector("img").getAttribute("src")).toBe(
      `${window.location.origin}/og-image-shop-products.jpg?v=20260910-mobile`,
    );
    expect(chips[1].querySelector("img").getAttribute("src")).toBe("https://example.com/shop-og.jpg");
    expect([...container.querySelectorAll(".ai-response-link")].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Book Repair", "/booking"],
      ["Service details", "/learn-more?service=ac_repair"],
      ["https://example.com/user_guide", "https://example.com/user_guide"],
      ["/contact", "/contact"],
      ["Prakash Electronics Instagram", "https://www.instagram.com/prakash_electronics1?psln=example%2Bvalue&source=chat"],
    ]);
    expect(container.querySelectorAll(".ai-md-list-item")).toHaveLength(2);
    expect(container.textContent).not.toContain("ln=example");

    const thumbnail = chips[1].querySelector(".ai-website-link-thumbnail");
    act(() => thumbnail.querySelector("img").dispatchEvent(new Event("error")));
    expect(thumbnail.querySelector("img.is-favicon")).not.toBeNull();
    act(() => thumbnail.querySelector("img").dispatchEvent(new Event("error")));
    expect(thumbnail.querySelector("svg")).not.toBeNull();
  } finally {
    act(() => root.unmount());
    sessionStorage.removeItem(storageKey);
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldActEnvironment;
    HTMLElement.prototype.scrollIntoView = oldScrollIntoView;
  }
});

test("reveals the reply immediately in chunks, then shows its link chips", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const oldActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const oldScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const oldUrl = window.location.href;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  jest.useFakeTimers();
  window.history.replaceState({}, "", "/pulse-ai#catalog-search");
  sessionStorage.setItem("prakash:pulse-ai-catalog-prompt", "Show products");
  const answer = "Here are some useful pages for browsing products and booking repairs.";
  apiRequest.mockResolvedValueOnce({ data: {
    response: answer,
    linkCards: [{ title: "Shop Products", url: "/products" }],
  } });

  try {
    await act(async () => root.render(<CartProvider><ScienceAIPage /></CartProvider>));
    const reply = container.querySelector('[aria-label="Pulse AI response"]');
    expect(reply.querySelector(".ai-message-body").textContent.trim()).toBe("Here are some");
    expect(reply.getAttribute("aria-busy")).toBe("true");
    expect(reply.querySelector(".ai-website-link-chip")).toBeNull();
    expect(container.querySelector("textarea").disabled).toBe(false);

    act(() => jest.advanceTimersByTime(1200));
    expect(reply.querySelector(".ai-message-body").textContent).toBe(answer);
    expect(reply.querySelector(".ai-website-link-chip").getAttribute("href")).toBe("/products");
  } finally {
    act(() => root.unmount());
    jest.useRealTimers();
    sessionStorage.removeItem("prakash:pulse-ai-sessions:v2");
    sessionStorage.removeItem("prakash:pulse-ai-catalog-prompt");
    window.history.replaceState({}, "", oldUrl);
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldActEnvironment;
    HTMLElement.prototype.scrollIntoView = oldScrollIntoView;
  }
});

test("the suggestion link sends its greeting once in a new chat", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const oldUrl = window.location.href;
  const oldActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const oldScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const storageKey = "prakash:pulse-ai-sessions:v2";
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  jest.useFakeTimers();
  window.history.replaceState({}, "", "/pulse-ai#say-hello");
  sessionStorage.setItem(storageKey, JSON.stringify({
    activeSessionId: "existing-chat",
    sessions: [{ id: "existing-chat", messages: [{ role: "user", text: "My existing chat" }] }],
  }));
  apiRequest.mockClear();
  apiRequest.mockResolvedValueOnce({ data: { response: "I can help with products and repair bookings." } });

  try {
    await act(async () => root.render(<CartProvider><ScienceAIPage /></CartProvider>));
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][0]).toBe("/science-ai/chat");
    const request = JSON.parse(apiRequest.mock.calls[0][1].body);
    expect(request.message).toBe("Hi Pulse AI! What can you help me with?");
    expect(request.sessionId).not.toBe("existing-chat");
    expect(window.location.hash).toBe("");
  } finally {
    act(() => root.unmount());
    jest.useRealTimers();
    sessionStorage.removeItem(storageKey);
    window.history.replaceState({}, "", oldUrl);
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldActEnvironment;
    HTMLElement.prototype.scrollIntoView = oldScrollIntoView;
  }
});
