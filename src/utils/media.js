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

const SEED_AVIF_WIDTHS = {
  "gallery-1": [360],
  "gallery-3": [480, 960, 1448],
  "gallery-6": [480, 720, 740],
  "gallery-7": [360, 480, 651],
  "gallery-8": [360, 480, 676],
  "gallery-9": [360, 480, 687],
  "gallery-10": [360, 480, 489],
  "hero-technician": [360, 480, 720, 960, 1080, 1254],
};

const RESPONSIVE_IMAGE_WIDTHS = [360, 480, 720, 960, 1200, 1600];

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

function cloudinaryImageUrl(value, width, format) {
  const url = String(value || "").trim().replace(/^http:\/\//i, "https://");
  if (!/^https:\/\/res\.cloudinary\.com\//i.test(url) || !url.includes("/image/upload/")) return "";
  if (/\/image\/upload\/[^/]*(?:f_auto|f_avif|f_webp|q_auto|w_\d+)/i.test(url)) return "";
  const quality = width <= 480 ? "q_auto:eco" : "q_auto:good";
  return url.replace("/image/upload/", `/image/upload/f_${format},${quality},c_limit,w_${width}/`);
}

function responsiveWidthList(maxWidth = 1200) {
  const max = Math.max(360, Number(maxWidth) || 1200);
  const widths = RESPONSIVE_IMAGE_WIDTHS.filter((width) => width <= max * 1.35);
  return widths.length ? widths : [360, 480, 720];
}

export function getResponsiveImageSources(value, options = {}) {
  const info = getSeedImageInfo(value);
  if (!info) return getCloudinaryResponsiveImageSources(value, options);
  const avifWidths = SEED_AVIF_WIDTHS[info.base] || [];
  return {
    avif: avifWidths.length ? avifWidths.map((width) => `${seedImageUrl(info.base, width, "avif")} ${width}w`).join(", ") : "",
    webp: info.widths.map((width) => `${seedImageUrl(info.base, width, "webp")} ${width}w`).join(", "),
  };
}

export function getCloudinaryResponsiveImageSources(value, options = {}) {
  const widths = responsiveWidthList(options.maxWidth || options.width);
  const avif = widths
    .map((width) => {
      const url = cloudinaryImageUrl(value, width, "avif");
      return url ? `${url} ${width}w` : "";
    })
    .filter(Boolean)
    .join(", ");
  const webp = widths
    .map((width) => {
      const url = cloudinaryImageUrl(value, width, "webp");
      return url ? `${url} ${width}w` : "";
    })
    .filter(Boolean)
    .join(", ");
  return avif || webp ? { avif, webp } : null;
}

export function getOptimizedImageUrl(value, options = {}) {
  const url = String(value || "").trim();
  if (!url) return "";

  const width = Number(options.width || 1200);
  // Smaller widths use eco quality — better for 4GB phones / slower networks.
  const quality = width <= 480 ? "q_auto:eco" : width <= 960 ? "q_auto:good" : "q_auto:good";
  const transformation = `f_auto,${quality},c_limit,w_${width}`;
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

  const pendingImages = new Set();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    pendingImages.forEach(applyImageDefaults);
    pendingImages.clear();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if ("requestIdleCallback" in window) window.requestIdleCallback(flush, { timeout: 1000 });
    else window.setTimeout(flush, 100);
  };
  const queueImage = (image) => {
    if (!image || image.dataset.mediaManaged === "true") return;
    pendingImages.add(image);
    schedule();
  };

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === "IMG") queueImage(node);
        node.querySelectorAll?.("img").forEach(queueImage);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
