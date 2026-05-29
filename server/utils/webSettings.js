function ensurePngDeliveryUrl(url = "") {
  if (!url || !url.includes("/image/upload/")) return url;
  const [base, query = ""] = url.split("?");
  const withoutExtension = base.replace(/\.(jpe?g|webp|gif|avif)$/i, ".png");
  const withTransformation = withoutExtension.includes("/image/upload/f_png/")
    ? withoutExtension
    : withoutExtension.replace("/image/upload/", "/image/upload/f_png/");
  return query ? `${withTransformation}?${query}` : withTransformation;
}

function normalizeAsset(asset = {}) {
  const format = asset.format || "";
  return {
    url: format === "png" ? ensurePngDeliveryUrl(asset.url) : asset.url || "",
    publicId: asset.publicId || "",
    width: asset.width || 0,
    height: asset.height || 0,
    format,
    bytes: asset.bytes || 0,
    updatedAt: asset.updatedAt || null,
  };
}

function normalizeSettings(settings) {
  return {
    ogImage: normalizeAsset(settings?.ogImage),
    favicon: normalizeAsset(settings?.favicon),
    appleTouchIcon: normalizeAsset(settings?.appleTouchIcon),
    faviconSizes: (settings?.faviconSizes || []).map(normalizeAsset),
    updatedAt: settings?.updatedAt || null,
  };
}

module.exports = { ensurePngDeliveryUrl, normalizeAsset, normalizeSettings };
