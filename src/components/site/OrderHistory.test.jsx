import { act } from "react";
import { createRoot } from "react-dom/client";
import { randomFillSync } from "crypto";
import { apiRequest } from "../../api/client";
import { OrderHistory } from "./OrderHistory";

jest.mock("../../api/client", () => ({ apiRequest: jest.fn() }));
jest.mock("./WhatsAppOtpModal", () => ({
  WhatsAppOtpModal: ({ open, purpose, onVerified }) => open ? (
    <button type="button" onClick={() => onVerified({ challengeId: "challenge", verifiedToken: "token" })}>
      Verify {purpose}
    </button>
  ) : null,
}));

test("history requires verification and opens unpaid order details in the sheet", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const before = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  apiRequest.mockResolvedValueOnce({ data: { orders: [
    { orderId: "PEUNPAID", paymentStatus: "failed", canPay: true, total: 149, placedAt: "2026-11-26",
      items: [{ productName: "Adapter", quantity: 2 }] },
    { orderId: "PEPAID", paymentStatus: "paid", total: 249, invoiceNumber: "INV-249" },
  ] } });
  const button = (text) => [...container.querySelectorAll("button")].find((item) => item.textContent.includes(text));
  try {
    await act(async () => root.render(<OrderHistory renderDetails={(order) => <p>Items in {order.orderId}</p>} />));
    await act(async () => button("View all orders").click());
    expect(apiRequest).not.toHaveBeenCalled();
    const input = container.querySelector("input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "9000000001");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Send code").click());
    await act(async () => button("Verify order-history").click());
    expect(apiRequest.mock.calls[0][0]).toBe("/orders/history");
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toMatchObject({ challengeId: "challenge", verifiedToken: "token" });
    expect(container.textContent).toContain("INV-249");
    expect(container.textContent).toContain("Payment unsuccessful");
    await act(async () => container.querySelector('[aria-label="View order PEUNPAID"]').click());
    expect(container.querySelector("dialog").textContent).toContain("Items in PEUNPAID");
    expect(button("Pay now")).toBeDefined();
    await act(async () => container.querySelector('[aria-label="Close order details"]').click());
    expect(container.querySelector("dialog")).toBeNull();
  } finally {
    window.sessionStorage.clear();
    act(() => root.unmount());
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = before;
  }
});

test("WhatsApp history waits for browser approval and refresh restores the verified session", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root = createRoot(container);
  const before = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  const originalCrypto = Object.getOwnPropertyDescriptor(window, "crypto");
  Object.defineProperty(window, "crypto", { configurable: true, value: { getRandomValues: randomFillSync } });
  apiRequest.mockClear();
  window.history.replaceState({}, "", "/orders#viewOrders=private-code");
  const credentials = { challengeId: "challenge", verifiedToken: "session-token", expiresInMs: 900000 };
  const page = { data: { orders: [{ orderId: "PEFROMCHAT", paymentStatus: "paid", total: 249 }] } };
  const confirmationUrl = "https://wa.me/919000000002?text=VERIFY";
  apiRequest.mockResolvedValueOnce({ data: { confirmationUrl } })
    .mockResolvedValueOnce({ data: credentials }).mockResolvedValueOnce(page).mockResolvedValueOnce(page);
  const render = () => root.render(<OrderHistory renderDetails={() => null} />);
  try {
    await act(async () => render());
    await act(async () => jest.advanceTimersByTime(0));
    expect(window.location.hash).toBe("");
    expect(apiRequest.mock.calls[0][0]).toBe("/orders/history/link");
    const linkRequest = JSON.parse(apiRequest.mock.calls[0][1].body);
    expect(linkRequest).toEqual({ code: "private-code", browserToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(container.querySelector("a").href).toBe(confirmationUrl);
    expect(container.textContent).not.toContain("PEFROMCHAT");
    await act(async () => jest.advanceTimersByTime(4000));
    expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual(linkRequest);
    expect(container.textContent).toContain("PEFROMCHAT");
    expect(container.querySelector("input")).toBeNull();

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => render());
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual(["/orders/history/link", "/orders/history/link", "/orders/history", "/orders/history"]);
    expect(container.textContent).toContain("PEFROMCHAT");

    await act(async () => root.unmount());
    window.sessionStorage.clear();
    root = createRoot(container);
    await act(async () => render());
    await act(async () => container.querySelector(".order-history-trigger").click());
    expect(container.querySelector("#order-history-number")).not.toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(4);
  } finally {
    act(() => root.unmount());
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    jest.useRealTimers();
    if (originalCrypto) Object.defineProperty(window, "crypto", originalCrypto);
    else delete window.crypto;
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = before;
  }
});
