import { act } from "react";
import { createRoot } from "react-dom/client";
import { FirstVisitSuggestions } from "./FirstVisitSuggestions";

jest.mock("./PulseOrbAnimation", () => ({ PulseOrbAnimation: () => null }));

const visitKey = "prakash:first-visit-suggestions:v1";

function setup() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const prototype = window.HTMLDialogElement.prototype;
  const { showModal, close } = prototype;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  prototype.close = function close() { this.removeAttribute("open"); };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();

  const render = (component = <FirstVisitSuggestions />) => act(() => root.render(component));
  const tick = (milliseconds) => act(() => { jest.advanceTimersByTime(milliseconds); });
  const sheet = () => document.querySelector(".first-visit-suggestion[open]");
  function cleanup() {
    act(() => root.unmount());
    container.remove();
    localStorage.removeItem(visitKey);
    sessionStorage.removeItem(visitKey);
    prototype.showModal = showModal;
    prototype.close = close;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    jest.useRealTimers();
  }
  return { render, tick, sheet, cleanup };
}

test("shows each suggestion once per browser and starts independently in a fresh browser", () => {
  const { render, tick, sheet, cleanup } = setup();
  try {
    render();
    tick(19_999);
    expect(sheet()).toBeNull();
    tick(1);
    expect(sheet().querySelector("h2").textContent).toBe("Pulse AI");
    expect(sheet().querySelector("a").getAttribute("href")).toBe("/pulse-ai#say-hello");
    expect(sheet().querySelector("button")).toBeNull();

    tick(30_000);
    expect(sheet().querySelector("h2").textContent).toBe("Pulse AI");
    act(() => sheet().dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(sheet()).toBeNull();
    tick(7_999);
    expect(sheet()).toBeNull();
    tick(1);
    expect(sheet().querySelector("h2").textContent).toBe("Connect with us on WhatsApp");
    expect(sheet().querySelector("a").getAttribute("href")).toBe("https://wa.me/916200267880");

    render(null);
    sessionStorage.removeItem(visitKey);
    render();
    tick(40_000);
    expect(sheet()).toBeNull();

    render(null);
    localStorage.removeItem(visitKey);
    sessionStorage.removeItem(visitKey);
    render();
    tick(20_000);
    expect(sheet().querySelector("h2").textContent).toBe("Pulse AI");
    const pulseLink = sheet().querySelector("a");
    pulseLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    act(() => pulseLink.click());
    tick(7_999);
    expect(sheet()).toBeNull();
    tick(1);
    expect(sheet().querySelector("h2").textContent).toBe("Connect with us on WhatsApp");
  } finally {
    cleanup();
  }
});

test("a new visit can show cards that were never shown, including in a browser that has used Pulse AI", () => {
  const { render, tick, sheet, cleanup } = setup();
  localStorage.setItem("pulse-ai-theme", "light");
  try {
    render();
    tick(5_000);
    render(null);
    sessionStorage.removeItem(visitKey);

    render();
    tick(19_999);
    expect(sheet()).toBeNull();
    tick(1);
    expect(sheet().querySelector("h2").textContent).toBe("Pulse AI");
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(sheet()).toBeNull();
    render(null);
    sessionStorage.removeItem(visitKey);
    tick(2_000);

    render();
    tick(5_999);
    expect(sheet()).toBeNull();
    tick(1);
    expect(sheet().querySelector("h2").textContent).toBe("Connect with us on WhatsApp");
  } finally {
    localStorage.removeItem("pulse-ai-theme");
    cleanup();
  }
});

test("carries the first-visit timer across pages and waits for an open storefront dialog", () => {
  const { render, tick, sheet, cleanup } = setup();
  const productDialog = document.createElement("dialog");
  document.body.append(productDialog);
  try {
    render();
    tick(10_000);
    render(null);
    productDialog.showModal();
    render();
    tick(10_000);
    expect(sheet()).toBeNull();

    productDialog.close();
    tick(1_000);
    expect(sheet().querySelector("h2").textContent).toBe("Pulse AI");

    tick(4_000);
    render(null);
    render();
    expect(sheet()).toBeNull();
    tick(7_999);
    expect(sheet()).toBeNull();
    tick(1);
    expect(sheet().querySelector("h2").textContent).toBe("Connect with us on WhatsApp");
  } finally {
    productDialog.remove();
    cleanup();
  }
});

test("a second tab waits until the Pulse AI card has been dismissed", () => {
  const { render, tick, sheet, cleanup } = setup();
  try {
    const pulseShownAt = Date.now();
    localStorage.setItem(visitKey, JSON.stringify({ pulseShownAt, pulseDismissedAt: null }));
    render();
    tick(30_000);
    expect(sheet()).toBeNull();

    localStorage.setItem(visitKey, JSON.stringify({ pulseShownAt, pulseDismissedAt: Date.now() }));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: visitKey })));
    tick(7_999);
    expect(sheet()).toBeNull();
    tick(1);
    expect(sheet().querySelector("h2").textContent).toBe("Connect with us on WhatsApp");
  } finally {
    cleanup();
  }
});
