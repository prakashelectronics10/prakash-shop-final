import { act } from "react";
import { createRoot } from "react-dom/client";
import { apiRequest } from "../../api/client";
import { PAYMENT_RECOVERY_URL, savePaymentRecovery } from "../../utils/orderPayment";
import { CheckoutPage } from "./CheckoutPage";

const mockClearCart = jest.fn();
jest.mock("../../api/client", () => ({ apiRequest: jest.fn(), apiUrl: (path) => path }));
jest.mock("../../context/CartContext", () => ({ useCart: () => ({ items: [], totals: {}, clearCart: mockClearCart }) }));
jest.mock("../../hooks/useOrderQuote", () => ({ useOrderQuote: () => ({}) }));
jest.mock("./Navbar", () => ({ Navbar: () => null }));
jest.mock("./Footer", () => ({ Footer: () => null }));

test("checkout reload recovers a captured payment even with an empty cart", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const previousUrl = window.location.href;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", PAYMENT_RECOVERY_URL);
  savePaymentRecovery({ orderId: "PECAPTURED", razorpayOrderId: "order_captured", keyId: "test", amount: 15900, currency: "INR" }, {
    clearCart: true, awaitingConfirmation: true,
  });
  apiRequest.mockRejectedValue(new Error("Unexpected payment API route")).mockResolvedValueOnce({
    data: { order: { orderId: "PECAPTURED", customerName: "Customer", total: 159, itemCount: 1, paymentStatus: "paid" } },
  });

  try {
    await act(async () => root.render(<CheckoutPage />));
    expect(container.textContent).toContain("Your order is confirmed");
    expect(container.textContent).toContain("PECAPTURED");
    expect(mockClearCart).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual(["/orders/payment/status"]);
    expect(container.querySelector(".order-success-actions a").getAttribute("href")).toBe("/orders?id=PECAPTURED");
  } finally {
    act(() => root.unmount());
    window.sessionStorage.clear();
    window.history.replaceState({}, "", previousUrl);
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    scroll.mockRestore();
  }
});
