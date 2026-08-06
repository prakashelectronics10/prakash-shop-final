const WebSetting = require("../models/WebSetting");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { uploadBuffer, deleteImages } = require("../services/cloudinaryService");
const { processOgImage, processFavicon } = require("../services/imageProcessingService");
const { clearSitePayloadCache } = require("../services/siteService");
const { normalizeSettings } = require("../utils/webSettings");

const faviconSizes = [16, 32, 48, 180];

async function getOrCreateSettings() {
  return WebSetting.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function deleteExisting(publicIds) {
  const ids = [...new Set(publicIds.filter(Boolean))];
  if (!ids.length) return;
  await deleteImages(ids).catch((error) => {
    console.error("Failed to delete old web setting assets:", error.message);
  });
}

const getWebSettings = asyncHandler(async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ success: true, data: normalizeSettings(settings) });
});

const uploadOgImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("OG image file is required", 400);

  const settings = await getOrCreateSettings();
  const processed = await processOgImage(req.file.buffer);
  const uploaded = await uploadBuffer(processed.buffer, {
    folder: "prakash-electronics/web-settings/og",
    public_id: `og-image-${Date.now()}`,
    overwrite: true,
    resource_type: "image",
    format: "jpg",
  });

  const oldPublicId = settings.ogImage?.publicId;
  settings.ogImage = {
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
    width: processed.width,
    height: processed.height,
    format: processed.format,
    bytes: processed.bytes,
    updatedAt: new Date(),
  };
  await settings.save();
  await deleteExisting([oldPublicId]);
  clearSitePayloadCache();

  res.status(201).json({ success: true, data: normalizeSettings(settings) });
});

const deleteOgImage = asyncHandler(async (_req, res) => {
  const settings = await getOrCreateSettings();
  const oldPublicId = settings.ogImage?.publicId;
  settings.ogImage = {};
  await settings.save();
  await deleteExisting([oldPublicId]);
  clearSitePayloadCache();
  res.json({ success: true, data: normalizeSettings(settings) });
});

const uploadFavicon = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("Favicon file is required", 400);

  const settings = await getOrCreateSettings();
  const processedSizes = await Promise.all(faviconSizes.map((size) => processFavicon(req.file.buffer, size)));
  const uploads = await Promise.all(
    processedSizes.map((processed) =>
      uploadBuffer(processed.buffer, {
        folder: "prakash-electronics/web-settings/favicon",
        public_id: `favicon-${processed.size}-${Date.now()}`,
        overwrite: true,
        resource_type: "image",
        format: "png",
        transformation: [{ quality: "auto" }],
      }),
    ),
  );

  const assets = uploads.map((uploaded, index) => ({
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
    width: processedSizes[index].width,
    height: processedSizes[index].height,
    format: processedSizes[index].format,
    bytes: processedSizes[index].bytes,
    updatedAt: new Date(),
  }));

  const oldPublicIds = [
    settings.favicon?.publicId,
    settings.appleTouchIcon?.publicId,
    ...(settings.faviconSizes || []).map((asset) => asset.publicId),
  ];

  settings.favicon = assets.find((asset) => asset.width === 32) || assets[0];
  settings.appleTouchIcon = assets.find((asset) => asset.width === 180) || assets[assets.length - 1];
  settings.faviconSizes = assets;
  await settings.save();
  await deleteExisting(oldPublicIds);
  clearSitePayloadCache();

  res.status(201).json({ success: true, data: normalizeSettings(settings) });
});

const deleteFavicon = asyncHandler(async (_req, res) => {
  const settings = await getOrCreateSettings();
  const oldPublicIds = [
    settings.favicon?.publicId,
    settings.appleTouchIcon?.publicId,
    ...(settings.faviconSizes || []).map((asset) => asset.publicId),
  ];
  settings.favicon = {};
  settings.appleTouchIcon = {};
  settings.faviconSizes = [];
  await settings.save();
  await deleteExisting(oldPublicIds);
  clearSitePayloadCache();
  res.json({ success: true, data: normalizeSettings(settings) });
});

module.exports = {
  getWebSettings,
  uploadOgImage,
  deleteOgImage,
  uploadFavicon,
  deleteFavicon,
  normalizeSettings,
};
