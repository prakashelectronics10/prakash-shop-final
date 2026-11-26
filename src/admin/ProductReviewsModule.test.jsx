import { act } from "react";
import { createRoot } from "react-dom/client";
import ProductReviewsModule from "./ProductReviewsModule";

test("the open admin list reflects WhatsApp approval and only offers Decline", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();

  const review = {
    _id: "review-id", productName: "Bluetooth speaker", orderId: "PE1234", rating: 4,
    review: "Clear sound", createdAt: "2026-11-26T14:00:00Z", readAt: null, status: "pending",
  };
  const apiFetch = jest.fn(async (path) => {
    if (path.endsWith("/products")) return { data: [] };
    if (path.endsWith("/whatsapp")) return { data: { enabled: true, available: true, recipients: [] } };
    return { data: { items: [{ ...review }], total: 1, pages: 1 } };
  });
  const reviewActions = () => [...container.querySelectorAll(".admin-review-card button")].map((button) => button.textContent.trim());

  try {
    await act(async () => root.render(<ProductReviewsModule apiFetch={apiFetch} />));
    expect(reviewActions()).toEqual(["Approve", "Decline", "Mark as read"]);

    review.status = "approved";
    review.readAt = "2026-11-26T15:00:00Z";
    await act(async () => { jest.advanceTimersByTime(15_000); });

    expect(container.querySelector('.admin-review-card [data-status="approved"]')).not.toBeNull();
    expect(reviewActions()).toEqual(["Decline"]);
  } finally {
    act(() => root.unmount());
    jest.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
