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

const RESPONSIVE_IMAGE_WIDTHS = [240, 360, 480, 720, 960, 1200, 1600];

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

  const optimized = cleanPath.match(/(?:^|\/)seed-assets\/optimized\/([^/]+)-(\d+)\.(?:webp|avif)$/i);
  if (optimized) {
    const base = optimized[1];
    const widths = SEED_IMAGE_WIDTHS[base];
    return widths ? { base, widths } : null;
  }

  const original = cleanPath.match(/(?:^|\/)seed-assets\/([^/.]+)\.(?:jpe?g|png)$/i);
  if (!original) return null;
  const widths = SEED_IMAGE_WIDTHS[original[1]];
  return widths ? { base: original[1], widths } : null;
}

function closestSeedWidth(widths, requestedWidth) {
  const target = Number(requestedWidth || 960);
  return widths.find((width) => width >= target) || widths[widths.length - 1];
}

function seedImageUrl(base, width, format = "webp") {
  return `/seed-assets/optimized/${base}-${width}.${format}`;
}

function qualityForWidth(width) {
  if (width <= 360) return "q_auto:eco";
  if (width <= 720) return "q_auto:eco";
  if (width <= 1200) return "q_auto:good";
  return "q_auto:good";
}

/**
 * Returns Cloudinary URL with transforms stripped back to upload root + public id path,
 * so we can safely re-apply responsive f_avif/f_webp/w_ transforms.
 */
function getCloudinaryRootUrl(value) {
  const url = String(value || "").trim().replace(/^http:\/\//i, "https://");
  if (!/^https:\/\/res\.cloudinary\.com\//i.test(url) || !url.includes("/image/upload/")) return "";

  const match = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i);
  if (!match) return "";

  const prefix = match[1];
  let rest = match[2];

  // Already versioned path: optional transforms then v123/...
  const versioned = rest.match(/^(?:([^/]+)\/)?(v\d+\/.+)$/);
  if (versioned) {
    const maybeTransforms = versioned[1] || "";
    const path = versioned[2];
    if (!maybeTransforms || /(?:^|,)(?:f_|q_|w_|h_|c_|dpr_|e_|fl_)/.test(maybeTransforms)) {
      return `${prefix}${path}`;
    }
    // First segment was a folder name, keep it
    return `${prefix}${maybeTransforms}/${path}`;
  }

  // No version — strip leading transform segment when present
  if (/(?:^|,)(?:f_|q_|w_|h_|c_|dpr_|e_|fl_)/.test(rest.split("/")[0] || "")) {
    rest = rest.replace(/^[^/]+\//, "");
  }

  return `${prefix}${rest}`;
}

function cloudinaryImageUrl(value, width, format) {
  const root = getCloudinaryRootUrl(value);
  if (!root) return "";
  const quality = qualityForWidth(width);
  const transform = format === "auto"
    ? `f_auto,${quality},c_limit,w_${width}`
    : `f_${format},${quality},c_limit,w_${width}`;
  return root.replace("/image/upload/", `/image/upload/${transform}/`);
}

function responsiveWidthList(maxWidth = 1200) {
  const max = Math.max(160, Number(maxWidth) || 1200);
  const widths = RESPONSIVE_IMAGE_WIDTHS.filter((width) => width <= Math.ceil(max * 1.25));
  if (!widths.length) return [Math.min(360, max)];
  // Always include the target width bucket so browsers can pick a tight match
  if (!widths.includes(max) && max >= 160 && max <= 2000) {
    const next = RESPONSIVE_IMAGE_WIDTHS.find((width) => width >= max);
    if (next && !widths.includes(next)) widths.push(next);
    widths.sort((a, b) => a - b);
  }
  return widths;
}

export function getResponsiveImageSources(value, options = {}) {
  const requested = Number(options.maxWidth || options.width || 1200);
  // Tiny thumbnails don't need multi-format srcset overhead
  if (requested > 0 && requested <= 200) return null;

  const info = getSeedImageInfo(value);
  if (!info) return getCloudinaryResponsiveImageSources(value, options);

  const usableWidths = info.widths.filter((width) => width <= Math.ceil(requested * 1.35));
  const widths = usableWidths.length ? usableWidths : [info.widths[0]];
  const avifWidths = (SEED_AVIF_WIDTHS[info.base] || []).filter((width) => widths.includes(width));

  return {
    avif: avifWidths.length ? avifWidths.map((width) => `${seedImageUrl(info.base, width, "avif")} ${width}w`).join(", ") : "",
    webp: widths.map((width) => `${seedImageUrl(info.base, width, "webp")} ${width}w`).join(", "),
  };
}

export function getCloudinaryResponsiveImageSources(value, options = {}) {
  if (!getCloudinaryRootUrl(value)) return null;
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

  const cloudinary = cloudinaryImageUrl(url, width, "auto");
  if (cloudinary) return cloudinary;

  return url;
}

function applyImageDefaults(img) {
  if (!img || img.dataset.mediaManaged === "true") return;
  img.dataset.mediaManaged = "true";

  const src = img.getAttribute("src");
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;

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
    if (img.src.startsWith("data:") || img.src.startsWith("blob:")) return;

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
