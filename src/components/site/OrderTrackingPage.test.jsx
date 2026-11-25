import { act } from "react";
import { createRoot } from "react-dom/client";
import { apiRequest } from "../../api/client";
import { OrderTrackingPage } from "./OrderTrackingPage";

jest.mock("../../api/client", () => ({ apiRequest: jest.fn() }));
jest.mock("./Navbar", () => ({ Navbar: () => null }));
jest.mock("./Footer", () => ({ Footer: () => null }));

test("tracked products use the shared natural-ratio thumbnail and keep their product links", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const previousUrl = window.location.href;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", "/orders?id=PE-THUMBNAIL-TEST");
  apiRequest.mockResolvedValueOnce({
    data: {
      orderId: "PE-THUMBNAIL-TEST",
      orderStatus: "confirmed",
      itemCount: 2,
      items: [
        { productId: "first", productSlug: "tube-light", variantCombinationId: "colour", productName: "Tube light", productImageUrl: "/seed-assets/gallery-1.jpg" },
        { productId: "second", productName: "Adapter" },
      ],
    },
  });

  try {
    await act(async () => root.render(<OrderTrackingPage />));
    const thumbnails = container.querySelectorAll(".tracking-products .product-order-thumbnail");
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0].closest("a").getAttribute("href")).toBe("/product/tube-light?v=colour");
    const image = thumbnails[0].querySelector("img");
    expect(image.getAttribute("alt")).toBe("Tube light");
    expect(image.hasAttribute("height")).toBe(false);
    expect(image.getAttribute("width")).toBe("160");
    expect(thumbnails[1].querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  } finally {
    act(() => root.unmount());
    window.history.replaceState({}, "", previousUrl);
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
