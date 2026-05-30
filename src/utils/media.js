const FALLBACK_IMAGE = "/seed-assets/optimized/gallery-10-480.webp";

const SEED_IMAGE_WIDTHS = {
  "gallery-1": [360, 480, 720, 960, 1080, 1400, 1443],
  "gallery-2": [360, 480, 720, 800],
  "gallery-3": [360, 480, 720, 960, 1080, 1400, 1448],
  "gallery-4": [360, 480, 695],
  "gallery-5": [360, 480, 548],
  "gallery-6": [360, 480, 720, 740],
  "gallery-7": [360, 480, 651],
  "gallery-8": [360, 480, 676],
  "gallery-9": [360, 480, 687],
  "gallery-10": [360, 480, 489],
  "hero-technician": [360, 480, 720, 960, 1080, 1254],
};

function normalizeLocalSeedPath(url) {
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/seed-assets\//i.test(url)) {
    try {
      return new URL(url).pathname;
    } catch (_error) {
      return url;
    }
  }
  return url;
}

function getSeedImageInfo(value) {
  const url = normalizeLocalSeedPath(String(value || "").trim());
  const cleanPath = url.split("?")[0].split("#")[0];
  const match = cleanPath.match(/(?:^|\/)seed-assets\/([^/.]+)\.(?:jpe?g|png)$/i);
  if (!match) return null;
  const base = match[1];
  const widths = SEED_IMAGE_WIDTHS[base];
  if (!widths) return null;
  return { base, widths };
}

function closestSeedWidth(widths, requestedWidth) {
  const target = Number(requestedWidth || 960);
  return widths.find((width) => width >= target) || widths[widths.length - 1];
}

function seedImageUrl(base, width, format = "webp") {
  return `/seed-assets/optimized/${base}-${width}.${format}`;
}

export function getResponsiveImageSources(value) {
  const info = getSeedImageInfo(value);
  if (!info) return null;
  return {
    avif: info.widths.map((width) => `${seedImageUrl(info.base, width, "avif")} ${width}w`).join(", "),
    webp: info.widths.map((width) => `${seedImageUrl(info.base, width, "webp")} ${width}w`).join(", "),
  };
}

export function getOptimizedImageUrl(value, options = {}) {
  const url = String(value || "").trim();
  if (!url) return "";

  const width = Number(options.width || 1200);
  const transformation = `f_auto,q_auto:good,c_limit,w_${width}`;
  const seedInfo = getSeedImageInfo(url);

  if (seedInfo) {
    return seedImageUrl(seedInfo.base, closestSeedWidth(seedInfo.widths, width), "webp");
  }

  if (/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/seed-assets\//i.test(url)) {
    try {
      return new URL(url).pathname;
    } catch (_error) {
      return url;
    }
  }

  if (/^http:\/\/res\.cloudinary\.com\//i.test(url)) {
    return getOptimizedImageUrl(url.replace(/^http:\/\//i, "https://"), options);
  }

  if (/^https:\/\/res\.cloudinary\.com\//i.test(url) && url.includes("/image/upload/")) {
    if (/\/image\/upload\/[^/]*(?:f_auto|q_auto|w_\d+)/i.test(url)) return url;
    return url.replace("/image/upload/", `/image/upload/${transformation}/`);
  }

  return url;
}

function applyImageDefaults(img) {
  if (!img || img.dataset.mediaManaged === "true") return;
  img.dataset.mediaManaged = "true";

  const src = img.getAttribute("src");
  const optimized = getOptimizedImageUrl(src, {
    width: img.getAttribute("width") || img.dataset.displayWidth || 1200,
  });
  if (optimized && optimized !== src) {
    img.setAttribute("src", optimized);
  }

  if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
  if (!img.hasAttribute("loading") && img.getAttribute("fetchpriority") !== "high") {
    img.setAttribute("loading", "lazy");
  }
}

export function installGlobalImageFallbacks() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const onImageError = (event) => {
    const img = event.target;
    if (!img || img.tagName !== "IMG") return;

    if (img.dataset.fallbackApplied === "true") {
      img.style.visibility = "hidden";
      return;
    }

    img.dataset.fallbackApplied = "true";
    img.src = img.dataset.fallbackSrc || FALLBACK_IMAGE;
  };

  document.addEventListener("error", onImageError, true);
  document.querySelectorAll("img").forEach(applyImageDefaults);

  if (typeof MutationObserver === "undefined") return;

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === "IMG") applyImageDefaults(node);
        node.querySelectorAll?.("img").forEach(applyImageDefaults);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
