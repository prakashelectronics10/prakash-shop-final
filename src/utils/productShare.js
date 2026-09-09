const PRODUCT_DETAIL_BASE = "/product";
const SITE_NAME = "Prakash Electronics";

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

function absoluteProductImage(product = {}) {
  const imageValue = product.imageUrl || product.images?.find((item) => item?.url)?.url;
  return imageValue
    ? new URL(imageValue, window.location.origin).toString()
    : `${window.location.origin}/og-image.jpg`;
}

function productAvailability(product = {}) {
  const unavailable = /out of stock|not available/i.test(String(product.availability || ""));
  return unavailable ? "https://schema.org/OutOfStock" : "https://schema.org/InStock";
}

function productPrice(product = {}) {
  const numeric = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
  const mrp = numeric(product.mrp);
  const discount = numeric(product.discountPercent);
  const storedPrice = numeric(product.price);
  if (Number.isFinite(mrp) && mrp >= 0 && Number.isFinite(discount) && discount > 0) {
    return Math.max(0, Math.round(mrp * (1 - Math.min(100, discount) / 100)));
  }
  return Number.isFinite(storedPrice) && storedPrice >= 0 ? storedPrice : null;
}

function applyProductStructuredData(product, { description, image, url, publicOffers = [] }) {
  const bestOffer = publicOffers.find((offer) => offer?.visibility === "public" && Number.isFinite(Number(offer.finalPrice)));
  const price = bestOffer ? Number(bestOffer.finalPrice) : productPrice(product);
  const productSchema = {
    "@type": "Product",
    name: product.name,
    description,
    image: [image],
    url,
    sku: String(product.sku || product._id || product.id || product.slug || ""),
    category: product.category || undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    gtin: product.gtin || undefined,
    mpn: product.mpn || undefined,
    model: product.modelNumber || undefined,
    offers: price === null ? undefined : {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: String(price),
      availability: productAvailability(product),
      itemCondition: `https://schema.org/${product.condition === "used" ? "UsedCondition" : product.condition === "refurbished" ? "RefurbishedCondition" : "NewCondition"}`,
      seller: { "@type": "Organization", name: SITE_NAME },
      ...(bestOffer ? {
        name: bestOffer.title,
        description: bestOffer.description || undefined,
        identifier: bestOffer.code,
        validFrom: bestOffer.startsAt || undefined,
        priceValidUntil: bestOffer.endsAt ? String(bestOffer.endsAt).slice(0, 10) : undefined,
        image: bestOffer.bannerImageUrl || undefined,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: String(price),
          priceCurrency: "INR",
          name: bestOffer.title,
          validFrom: bestOffer.startsAt || undefined,
          validThrough: bestOffer.endsAt || undefined,
        },
      } : {}),
    },
  };
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      productSchema,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${window.location.origin}/` },
          { "@type": "ListItem", position: 2, name: product.category || "Products", item: `${window.location.origin}/products` },
          { "@type": "ListItem", position: 3, name: product.name, item: url },
        ],
      },
    ],
  };
  let script = document.head.querySelector("script[data-product-share]");
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.productShare = "true";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema).replace(/</g, "\\u003c");
}

export function applyProductPageMeta(product = {}, publicOffers = []) {
  if (typeof document === "undefined" || !product?.name) return;
  const title = `${product.seoTitle || product.name} | Prakash Electronics`;
  const description = getProductShareText(product);
  const url = getProductShareUrl(product);
  const image = absoluteProductImage(product);
  const bestOffer = publicOffers.find((offer) => offer?.visibility === "public" && Number.isFinite(Number(offer.finalPrice)));
  const price = bestOffer ? Number(bestOffer.finalPrice) : productPrice(product);
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }

  document.title = title;
  canonical.setAttribute("href", url);
  setMeta('meta[name="description"]', "name", "description", description);
  setMeta('meta[name="robots"]', "name", "robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  setMeta('meta[name="googlebot"]', "name", "googlebot", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  setMeta(
    'meta[name="keywords"]',
    "name",
    "keywords",
    [
      product.name,
      product.category,
      ...(Array.isArray(product.tags) ? product.tags : []),
      "electronics shop",
      "wiring accessories",
      "home appliances repairing",
      "cooler repairing",
      "AC repairing",
      "Prakash Electronics",
    ]
      .filter(Boolean)
      .join(", "),
  );
  setMeta('meta[property="og:type"]', "property", "og:type", "product");
  setMeta('meta[property="og:title"]', "property", "og:title", title);
  setMeta('meta[property="og:description"]', "property", "og:description", description);
  setMeta('meta[property="og:url"]', "property", "og:url", url);
  setMeta('meta[property="og:image"]', "property", "og:image", image);
  setMeta('meta[property="og:image:secure_url"]', "property", "og:image:secure_url", image);
  setMeta('meta[property="og:image:alt"]', "property", "og:image:alt", product.name);
  setMeta('meta[property="og:image:width"]', "property", "og:image:width", "1200");
  setMeta('meta[property="og:image:height"]', "property", "og:image:height", "630");
  if (price !== null) {
    setMeta('meta[property="product:price:amount"]', "property", "product:price:amount", String(price));
    setMeta('meta[property="product:price:currency"]', "property", "product:price:currency", "INR");
  }
  setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
  setMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
  applyProductStructuredData(product, { description, image, url, publicOffers });
}
