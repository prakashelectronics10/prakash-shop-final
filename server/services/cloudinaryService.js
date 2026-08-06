const env = require("../config/env");
const { cloudinary, configureCloudinary } = require("../config/cloudinary");
const AppError = require("../utils/AppError");
const { logger } = require("../utils/logger");

const DEFAULT_TRANSFORMATION = "f_auto,q_auto:good,c_limit,w_1600";
const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

function assertConfigured() {
  const configured = configureCloudinary();
  if (!configured) {
    throw new AppError("Cloudinary credentials are missing. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.", 500);
  }
}

function normalizeFolder(folder = "") {
  const base = String(env.cloudinary.folder || "prakash-electronics").replace(/^\/+|\/+$/g, "");
  const child = String(folder || "").replace(/^\/+|\/+$/g, "");
  if (!child) return base;
  if (child === base || child.startsWith(`${base}/`)) return child;
  return `${base}/${child}`;
}

function getOptimizedImageUrl(urlOrPublicId = "", options = {}) {
  const value = String(urlOrPublicId || "").trim();
  if (!value) return "";

  const width = Number(options.width || 1600);
  const transformation = options.rawTransformation || `f_auto,q_auto:good,c_limit,w_${width}`;

  if (/^https?:\/\/res\.cloudinary\.com\//i.test(value) && value.includes("/image/upload/")) {
    if (/\/image\/upload\/[^/]*(?:f_auto|q_auto|w_\d+)/i.test(value)) return value.replace(/^http:\/\//i, "https://");
    return value.replace(/^http:\/\//i, "https://").replace("/image/upload/", `/image/upload/${transformation}/`);
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:")) {
    return value;
  }

  assertConfigured();
  return cloudinary.url(value, {
    secure: true,
    transformation: [{ fetch_format: "auto", quality: "auto:good", width, crop: "limit" }],
  });
}

function withoutImageExtension(value = "") {
  return String(value || "").replace(/\.(?:jpg|jpeg|png|webp|avif|gif)$/i, "");
}

function findSegmentSequence(source, target) {
  if (!target.length || target.length > source.length) return -1;
  for (let index = 0; index <= source.length - target.length; index += 1) {
    if (target.every((segment, segmentIndex) => source[index + segmentIndex] === segment)) {
      return index;
    }
  }
  return -1;
}

function isTransformationSegment(segment = "") {
  return /[,]/.test(segment) || /^(?:a|ar|b|bo|c|co|cs|d|dn|dpr|e|f|fl|fn|g|h|l|o|p|pg|q|r|t|u|w|x|y|z)_/i.test(segment);
}

function extractPublicIdFromUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith("/") || raw.startsWith("data:")) return "";
    return withoutImageExtension(raw);
  }

  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    return "";
  }

  if (!/^res\.cloudinary\.com$/i.test(url.hostname)) return "";

  const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const uploadIndex = segments.findIndex((segment, index) => segment === "upload" && segments[index - 1] === "image");
  if (uploadIndex === -1) return "";

  let imagePath = segments.slice(uploadIndex + 1);
  if (!imagePath.length) return "";

  const folderSegments = normalizeFolder("").split("/").filter(Boolean);
  const folderIndex = findSegmentSequence(imagePath, folderSegments);
  if (folderIndex !== -1) {
    imagePath = imagePath.slice(folderIndex);
  } else {
    while (imagePath.length && isTransformationSegment(imagePath[0])) {
      imagePath = imagePath.slice(1);
    }
    if (/^v\d+$/i.test(imagePath[0] || "")) {
      imagePath = imagePath.slice(1);
    }
  }

  if (!imagePath.length) return "";
  return withoutImageExtension(imagePath.join("/"));
}

function collectPublicIdsFromSources(...sources) {
  const ids = [];
  const visit = (source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach(visit);
      return;
    }
    if (typeof source === "string") {
      const publicId = extractPublicIdFromUrl(source);
      if (publicId) ids.push(publicId);
      return;
    }
    if (typeof source === "object") {
      [
        source.publicId,
        source.imagePublicId,
        source.url,
        source.imageUrl,
        source.secure_url,
        source.originalUrl,
        source.optimizedUrl,
      ].forEach(visit);
    }
  };

  sources.forEach(visit);
  return [...new Set(ids.filter(Boolean))];
}

async function uploadBuffer(buffer, options = {}) {
  assertConfigured();
  const resourceType = options.resourceType || options.resource_type || "image";
  const uploadOptions = {
    folder: normalizeFolder(options.folder),
    resource_type: resourceType,
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    invalidate: true,
    timeout: 25000,
    ...options,
    folder: normalizeFolder(options.folder),
    resource_type: resourceType,
  };
  if (resourceType === "image") {
    uploadOptions.allowed_formats = options.allowed_formats || ALLOWED_FORMATS;
    uploadOptions.transformation = options.transformation || [{ quality: "auto:good", fetch_format: "auto" }];
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new AppError("Upload timeout: Image upload took too long", 408));
    }, 25000); // 25 second timeout per image

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        clearTimeout(timeout);
        if (error) {
          logger.error("cloudinary.upload_failed", { error: error.message });
          return reject(error);
        }
        const optimizedUrl = resourceType === "image"
          ? getOptimizedImageUrl(result.public_id, {
            width: options.deliveryWidth || 1600,
            rawTransformation: options.deliveryTransformation || DEFAULT_TRANSFORMATION,
          })
          : result.secure_url;
        logger.info("cloudinary.uploaded", {
          publicId: result.public_id,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          format: result.format,
          resourceType,
        });
        return resolve({
          ...result,
          original_secure_url: result.secure_url,
          optimized_url: optimizedUrl,
          secure_url: optimizedUrl,
        });
      },
    );

    stream.end(buffer);
  });
}

async function deleteResource(publicId, resourceType = "image") {
  assertConfigured();

  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (error, result) => {
      if (error) {
        logger.error("cloudinary.delete_failed", { publicId, error: error.message });
        return reject(error);
      }
      return resolve(result);
    });
  });
}

async function deleteImage(publicId) {
  return deleteResource(publicId, "image");
}

async function deleteImages(publicIds) {
  assertConfigured();

  const ids = [...new Set((publicIds || []).filter(Boolean))];
  const results = await Promise.allSettled(ids.map((publicId) => deleteImage(publicId)));
  const failed = results
    .map((result, index) => ({ result, publicId: ids[index] }))
    .filter((item) => item.result.status === "rejected");

  if (failed.length) {
    logger.warn("cloudinary.bulk_delete_partial", {
      failed: failed.map((item) => ({ publicId: item.publicId, error: item.result.reason?.message })),
    });
  }

  return results;
}

async function deleteResources(resources = []) {
  const items = resources
    .map((item) => ({
      publicId: String(item?.publicId || item || "").trim(),
      resourceType: String(item?.resourceType || item?.resource_type || "image").trim() || "image",
    }))
    .filter((item) => item.publicId);
  const unique = [...new Map(items.map((item) => [`${item.resourceType}:${item.publicId}`, item])).values()];
  return Promise.allSettled(unique.map((item) => deleteResource(item.publicId, item.resourceType)));
}

async function deleteImagesStrict(publicIds) {
  const ids = [...new Set((publicIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const results = await deleteImages(ids);
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) {
    throw new AppError(`Failed to delete ${failed.length} Cloudinary image${failed.length > 1 ? "s" : ""}. Please retry.`, 502);
  }
  return results;
}

module.exports = {
  collectPublicIdsFromSources,
  deleteResource,
  deleteResources,
  deleteImage,
  deleteImages,
  deleteImagesStrict,
  extractPublicIdFromUrl,
  getOptimizedImageUrl,
  normalizeFolder,
  uploadBuffer,
};
