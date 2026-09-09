import { applyDynamicWebSettings } from "./SiteDataContext";
import { applyProductPageMeta, getProductSharePath } from "../utils/productShare";

describe("applyDynamicWebSettings", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    document.head.innerHTML = `
      <meta property="og:image" content="https://example.com/old-og.jpg" />
      <meta property="og:image:secure_url" content="https://example.com/old-og.jpg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:image" content="https://example.com/old-og.jpg" />
      <link rel="icon" href="/old-16.png" sizes="16x16" />
      <link rel="icon" href="/old-32.png" sizes="32x32" />
      <link rel="shortcut icon" href="/old.ico" />
      <link rel="apple-touch-icon" href="/old-apple.png" />
    `;
  });

  test("replaces every stale icon and the OG image with cache-busted settings", () => {
    applyDynamicWebSettings({
      updatedAt: "2026-09-09T10:00:00.000Z",
      ogImage: { url: "https://cdn.example.com/new-og.jpg", width: 1200, height: 630 },
      favicon: { url: "https://cdn.example.com/favicon-32.png", width: 32, height: 32 },
      appleTouchIcon: { url: "https://cdn.example.com/favicon-180.png", width: 180, height: 180 },
      faviconSizes: [
        { url: "https://cdn.example.com/favicon-16.png", width: 16, height: 16 },
        { url: "https://cdn.example.com/favicon-32.png", width: 32, height: 32 },
      ],
    });

    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://cdn.example.com/new-og.jpg");
    const icons = [...document.head.querySelectorAll('link[rel="icon"]')];
    expect(icons).toHaveLength(2);
    expect(icons.every((icon) => icon.href.includes("?v="))).toBe(true);
    expect(document.head.querySelector('link[rel="shortcut icon"]')?.href).toContain("?v=");
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.href).toContain("?v=");
    expect(document.head.innerHTML).not.toContain("old-");
  });

  test("keeps a route-specific OG image while still replacing favicons site-wide", () => {
    window.history.replaceState({}, "", "/pulse-ai");
    applyDynamicWebSettings({
      updatedAt: "2026-09-09T10:00:00.000Z",
      ogImage: { url: "https://cdn.example.com/global-og.jpg", width: 1200, height: 630 },
      favicon: { url: "https://cdn.example.com/favicon-32.png", width: 32, height: 32 },
      faviconSizes: [{ url: "https://cdn.example.com/favicon-32.png", width: 32, height: 32 }],
    });

    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://example.com/old-og.jpg");
    expect(document.head.querySelector('link[rel="icon"]')?.getAttribute("href")).toContain("favicon-32.png?v=");
  });

  test("never replaces a shared product's own OG image with the main-domain image", () => {
    const product = {
      _id: "product-id",
      slug: "havells-bldc-fan",
      name: "Havells BLDC Fan",
      shortDescription: "Energy-efficient BLDC fan",
      imageUrl: "https://cdn.example.com/products/havells-bldc-fan.jpg",
      price: 2499,
      availability: "In Stock",
    };
    window.history.replaceState({}, "", getProductSharePath(product));
    applyProductPageMeta(product);
    applyDynamicWebSettings({
      updatedAt: "2026-09-09T10:00:00.000Z",
      ogImage: { url: "https://cdn.example.com/main-domain-og.jpg", width: 1200, height: 630 },
      favicon: { url: "https://cdn.example.com/favicon-32.png", width: 32, height: 32 },
      faviconSizes: [{ url: "https://cdn.example.com/favicon-32.png", width: 32, height: 32 }],
    });

    expect(window.location.pathname).toBe("/product/havells-bldc-fan");
    expect(document.head.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("product");
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(product.imageUrl);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("http://localhost/product/havells-bldc-fan");
    expect(document.head.querySelector('link[rel="icon"]')?.getAttribute("href")).toContain("favicon-32.png?v=");
  });
});
