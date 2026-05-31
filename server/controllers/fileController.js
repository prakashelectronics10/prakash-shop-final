const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const FileAsset = require("../models/FileAsset");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { serializeFileAsset, uploadFileAsset } = require("../services/fileAssetService");

function contentDisposition(type, fileName) {
  const safeName = String(fileName || "file").replace(/"/g, "");
  return `${type}; filename="${safeName}"`;
}

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("File is required", 400);
  const asset = await uploadFileAsset(req.file.buffer, req.file, {
    folder: "files",
    uploadedBy: req.admin?._id,
    relatedType: req.body?.relatedType || "other",
    relatedId: req.body?.relatedId || null,
  });
  res.status(201).json({ success: true, data: serializeFileAsset(asset) });
});

const getFile = asyncHandler(async (req, res) => {
  const asset = await FileAsset.findById(req.params.id).lean();
  if (!asset) throw new AppError("File not found", 404);
  res.json({ success: true, data: serializeFileAsset(asset) });
});

const streamFile = asyncHandler(async (req, res) => {
  const asset = await FileAsset.findById(req.params.id).lean();
  if (!asset) throw new AppError("File not found", 404);
  if (!asset.secureUrl) throw new AppError("File storage URL missing", 404);

  res.setHeader("Content-Type", asset.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", contentDisposition(req.downloadMode ? "attachment" : "inline", asset.fileName || asset.originalName));
  res.setHeader("Cache-Control", "private, max-age=300");

  if (asset.storageProvider === "local") {
    const absolutePath = path.resolve(__dirname, "..", asset.path || asset.secureUrl);
    if (!absolutePath.startsWith(path.resolve(__dirname, "..", "storage", "files"))) {
      throw new AppError("Invalid file path", 403);
    }
    if (asset.fileSize) res.setHeader("Content-Length", asset.fileSize);
    fs.createReadStream(absolutePath).on("error", () => res.destroy()).pipe(res);
    return;
  }

  const upstream = await fetch(asset.secureUrl);
  if (!upstream.ok || !upstream.body) throw new AppError("Unable to read stored file", 502);

  const contentLength = upstream.headers.get("content-length") || asset.fileSize;
  if (contentLength) res.setHeader("Content-Length", contentLength);

  Readable.fromWeb(upstream.body).pipe(res);
});

const downloadFile = asyncHandler(async (req, res, next) => {
  req.downloadMode = true;
  return streamFile(req, res, next);
});

module.exports = { downloadFile, getFile, streamFile, uploadFile };
