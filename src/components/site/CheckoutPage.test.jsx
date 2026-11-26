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

test("paid checkout opens one product review at a time without an Order ID prompt", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const previousUrl = window.location.href;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const dialog = window.HTMLDialogElement.prototype;
  const previousShowModal = dialog.showModal;
  const previousClose = dialog.close;
  const scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dialog.showModal = function showModal() { this.setAttribute("open", ""); };
  dialog.close = function close() { this.removeAttribute("open"); };
  window.history.replaceState({}, "", PAYMENT_RECOVERY_URL);
  savePaymentRecovery({ orderId: "PEMULTIPRODUCT", razorpayOrderId: "order_multiple" }, { awaitingConfirmation: true });
  const reviewItems = [
    { sourceType: "shop-product", productId: "first", productName: "Bluetooth speaker", productImageUrl: "/speaker.png" },
    { sourceType: "project-part", productId: "second", productName: "Copper cable", productImageUrl: "/cable.png" },
  ];
  apiRequest.mockReset().mockResolvedValue({ success: true }).mockResolvedValueOnce({ data: { order: {
    orderId: "PEMULTIPRODUCT", customerName: "Customer", total: 300, itemCount: 2, paymentStatus: "paid", reviewItems,
  } } });

  try {
    await act(async () => root.render(<CheckoutPage />));
    const readSheet = () => document.querySelector(".product-review-dialog");
    expect(readSheet().textContent).toContain("Product 1 of 2");
    expect(readSheet().textContent).toContain("Bluetooth speaker");
    expect(readSheet().querySelector("input[name=orderId]")).toBeNull();
    await act(async () => readSheet().querySelector('[data-rating="5"]').click());
    await act(async () => readSheet().querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(readSheet().textContent).toContain("Copper cable");
    expect(readSheet().textContent).toContain("Product 2 of 2");
    await act(async () => readSheet().querySelector('[data-rating="4"]').click());
    await act(async () => readSheet().querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(readSheet()).toBeNull();
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      "/orders/payment/status", "/product-reviews/public/shop-product/first", "/product-reviews/public/project-part/second",
    ]);
    expect(apiRequest.mock.calls.slice(1).map(([, options]) => JSON.parse(options.body))).toEqual([
      { orderId: "PEMULTIPRODUCT", rating: 5, review: "" }, { orderId: "PEMULTIPRODUCT", rating: 4, review: "" },
    ]);
  } finally {
    act(() => root.unmount());
    dialog.showModal = previousShowModal;
    dialog.close = previousClose;
    window.sessionStorage.clear();
    window.history.replaceState({}, "", previousUrl);
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    scroll.mockRestore();
  }
});
