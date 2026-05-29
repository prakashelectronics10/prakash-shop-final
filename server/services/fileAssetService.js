const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const FileAsset = require("../models/FileAsset");
const { uploadBuffer } = require("./cloudinaryService");

const MIME_EXTENSIONS = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
};

function sanitizeFileName(value = "file") {
  const clean = String(value || "file")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean.slice(0, 140) || "file";
}

function extensionFor(name = "", mimeType = "") {
  const ext = path.extname(String(name || "")).replace(".", "").toLowerCase();
  return ext || MIME_EXTENSIONS[mimeType] || "";
}

function fileTypeFor(mimeType = "", name = "") {
  if (/^image\//i.test(mimeType)) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (/wordprocessingml|msword/i.test(mimeType)) return "document";
  if (/spreadsheetml|ms-excel|csv/i.test(mimeType)) return "spreadsheet";
  if (/presentationml|ms-powerpoint/i.test(mimeType)) return "presentation";
  if (/zip|compressed/i.test(mimeType)) return "archive";
  if (/^text\//i.test(mimeType)) return "text";
  const ext = extensionFor(name, mimeType);
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "document";
  if (["xls", "xlsx", "csv"].includes(ext)) return "spreadsheet";
  if (["ppt", "pptx"].includes(ext)) return "presentation";
  return "file";
}

function safeObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

function apiFileUrl(assetId, mode = "open") {
  if (mode === "metadata") return `/api/files/${assetId}`;
  if (mode === "download") return `/api/files/${assetId}/download`;
  return `/api/files/${assetId}/open`;
}

async function createLocalFileAsset(buffer, file, options = {}) {
  const mimeType = file?.mimetype || options.mimeType || "application/octet-stream";
  const originalName = file?.originalname || options.originalName || options.fileName || "file";
  const ext = extensionFor(originalName, mimeType);
  const fileName = sanitizeFileName(options.fileName || originalName || `file.${ext || "bin"}`);
  const storageName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${fileName}`;
  const relativePath = path.join("storage", "files", storageName);
  const absolutePath = path.resolve(__dirname, "..", relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const asset = await FileAsset.create({
    originalName,
    fileName,
    mimeType,
    fileSize: file?.size || buffer.length || options.fileSize || 0,
    fileType: fileTypeFor(mimeType, originalName),
    extension: ext,
    storageProvider: "local",
    secureUrl: relativePath.replace(/\\/g, "/"),
    path: relativePath.replace(/\\/g, "/"),
    uploadedBy: safeObjectId(options.uploadedBy),
    relatedType: options.relatedType || "other",
    relatedId: safeObjectId(options.relatedId),
    relatedInvoice: options.relatedType === "invoice" ? safeObjectId(options.relatedId) : null,
    relatedDiscussionMessage: options.relatedType === "discussion" ? safeObjectId(options.relatedId) : null,
  });
  asset.fileUrl = apiFileUrl(asset._id);
  asset.downloadUrl = apiFileUrl(asset._id, "download");
  await asset.save();
  return asset;
}

async function createFileAssetFromUpload(uploaded, file, options = {}) {
  const mimeType = file?.mimetype || options.mimeType || "application/octet-stream";
  const originalName = file?.originalname || options.originalName || options.fileName || "file";
  const ext = extensionFor(originalName, mimeType);
  const fileName = sanitizeFileName(options.fileName || originalName || `file.${ext || "bin"}`);
  const asset = await FileAsset.create({
    originalName,
    fileName,
    mimeType,
    fileSize: file?.size || uploaded.bytes || options.fileSize || 0,
    fileType: fileTypeFor(mimeType, originalName),
    extension: ext,
    storageProvider: "cloudinary",
    secureUrl: uploaded.original_secure_url || uploaded.secure_url,
    publicId: uploaded.public_id || "",
    uploadedBy: safeObjectId(options.uploadedBy),
    relatedType: options.relatedType || "other",
    relatedId: safeObjectId(options.relatedId),
    relatedInvoice: options.relatedType === "invoice" ? safeObjectId(options.relatedId) : null,
    relatedDiscussionMessage: options.relatedType === "discussion" ? safeObjectId(options.relatedId) : null,
    width: uploaded.width || null,
    height: uploaded.height || null,
  });
  asset.fileUrl = apiFileUrl(asset._id);
  asset.downloadUrl = apiFileUrl(asset._id, "download");
  await asset.save();
  return asset;
}

async function uploadFileAsset(buffer, file, options = {}) {
  const mimeType = file?.mimetype || options.mimeType || "application/octet-stream";
  const isImage = /^image\//i.test(mimeType);
  const uploaded = await uploadBuffer(buffer, {
    folder: options.folder || "files",
    resourceType: isImage ? "image" : "raw",
    deliveryWidth: options.deliveryWidth || 1400,
  });
  return createFileAssetFromUpload(uploaded, { ...file, mimetype: mimeType }, options);
}

function serializeFileAsset(asset) {
  if (!asset) return null;
  const value = asset.toObject ? asset.toObject() : asset;
  return {
    id: String(value._id || value.id || ""),
    _id: String(value._id || value.id || ""),
    originalName: value.originalName || value.fileName || "",
    fileName: value.fileName || value.originalName || "file",
    name: value.fileName || value.originalName || "file",
    mimeType: value.mimeType || "application/octet-stream",
    fileSize: value.fileSize || 0,
    size: value.fileSize || 0,
    fileType: value.fileType || "file",
    type: value.fileType === "image" ? "image" : value.fileType === "pdf" ? "pdf" : "document",
    extension: value.extension || "",
    storageProvider: value.storageProvider || "cloudinary",
    fileUrl: value.fileUrl || apiFileUrl(value._id || value.id),
    url: value.fileUrl || apiFileUrl(value._id || value.id),
    openUrl: value.fileUrl || apiFileUrl(value._id || value.id),
    metadataUrl: apiFileUrl(value._id || value.id, "metadata"),
    downloadUrl: value.downloadUrl || apiFileUrl(value._id || value.id, "download"),
    publicId: value.publicId || "",
    width: value.width || null,
    height: value.height || null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

module.exports = {
  apiFileUrl,
  createLocalFileAsset,
  createFileAssetFromUpload,
  fileTypeFor,
  sanitizeFileName,
  serializeFileAsset,
  uploadFileAsset,
};
