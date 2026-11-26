import { act } from "react";
import { createRoot } from "react-dom/client";
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

test("Track Order restores verification from this tab only", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root = createRoot(container);
  const before = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  apiRequest.mockClear();
  window.history.replaceState({}, "", "/orders");
  const credentials = { challengeId: "challenge", verifiedToken: "session-token", expiresAt: Date.now() + 900000 };
  window.sessionStorage.setItem("prakash.orderHistory", JSON.stringify(credentials));
  apiRequest.mockResolvedValueOnce({ data: { orders: [{ orderId: "PEVERIFIED", paymentStatus: "paid", total: 249 }] } });
  const render = () => root.render(<OrderHistory renderDetails={() => null} />);
  try {
    await act(async () => render());
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual(["/orders/history"]);
    expect(container.textContent).toContain("PEVERIFIED");

    await act(async () => root.unmount());
    window.sessionStorage.clear();
    root = createRoot(container);
    await act(async () => render());
    await act(async () => container.querySelector(".order-history-trigger").click());
    expect(container.querySelector("#order-history-number")).not.toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = before;
  }
});
