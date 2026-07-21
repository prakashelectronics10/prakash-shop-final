const PRODUCT_DETAIL_BASE = "/product-detail";

function productIdentifier(product = {}) {
  return String(product.slug || product._id || product.sourceId || product.id || "").trim();
}

export function getProductSharePath(product = {}) {
  const identifier = productIdentifier(product);
  return identifier ? `${PRODUCT_DETAIL_BASE}/${encodeURIComponent(identifier)}` : PRODUCT_DETAIL_BASE;
}

export function getProductShareUrl(product = {}) {
  const path = getProductSharePath(product);
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

export function getProductShareText(product = {}) {
  return String(
    product.shortDescription ||
      product.description ||
      `${product.name || "Product"} is available at Prakash Electronics.`,
  ).trim();
}

function setMeta(selector, attributeName, attributeValue, content) {
  if (!content || typeof document === "undefined") return;
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

export function applyProductPageMeta(product = {}) {
  if (typeof document === "undefined" || !product?.name) return;
  const title = `${product.name} | Prakash Electronics`;
  const description = getProductShareText(product);
  const url = getProductShareUrl(product);
  const image = product.imageUrl ? new URL(product.imageUrl, window.location.origin).toString() : `${window.location.origin}/og-image.jpg`;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }

  document.title = title;
  canonical.setAttribute("href", url);
  setMeta('meta[name="description"]', "name", "description", description);
  setMeta('meta[property="og:type"]', "property", "og:type", "product");
  setMeta('meta[property="og:title"]', "property", "og:title", title);
  setMeta('meta[property="og:description"]', "property", "og:description", description);
  setMeta('meta[property="og:url"]', "property", "og:url", url);
  setMeta('meta[property="og:image"]', "property", "og:image", image);
  setMeta('meta[property="og:image:secure_url"]', "property", "og:image:secure_url", image);
  setMeta('meta[property="og:image:alt"]', "property", "og:image:alt", product.name);
  setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
  setMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
}
