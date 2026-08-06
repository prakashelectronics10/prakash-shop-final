const multer = require("multer");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const {
  collectPublicIdsFromSources,
  deleteImagesStrict,
  normalizeFolder,
  uploadBuffer,
} = require("../services/cloudinaryService");

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 8 // Maximum 8 files
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      return cb(new AppError(`File ${file.originalname} is not a supported image. Upload JPG, PNG, WebP, AVIF, or GIF files.`, 400));
    }
    return cb(null, true);
  },
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("Image file is required", 400);
  const result = await uploadBuffer(req.file.buffer);

  res.status(201).json({
    success: true,
    data: {
      url: result.secure_url,
      originalUrl: result.original_secure_url || result.secure_url,
      optimizedUrl: result.optimized_url || result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    },
  });
});

const uploadImages = asyncHandler(async (req, res) => {
  if (!req.files || !req.files.length) throw new AppError("At least one image file is required", 400);

  const results = await Promise.all(
    req.files.map(async (file) => {
      const result = await uploadBuffer(file.buffer);
      return {
        url: result.secure_url,
        originalUrl: result.original_secure_url || result.secure_url,
        optimizedUrl: result.optimized_url || result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        originalName: file.originalname,
      };
    }),
  );

  res.status(201).json({
    success: true,
    data: results,
  });
});

const deleteUploadedImage = asyncHandler(async (req, res) => {
  const publicIds = collectPublicIdsFromSources(req.body.publicId, req.body.url, req.body.imageUrl);
  if (!publicIds.length) throw new AppError("Image public id or Cloudinary URL is required", 400);

  const allowedFolder = normalizeFolder("");
  const unsafePublicId = publicIds.find((publicId) => publicId !== allowedFolder && !publicId.startsWith(`${allowedFolder}/`));
  if (unsafePublicId) {
    throw new AppError("This image is outside the allowed Cloudinary folder", 403);
  }

  await deleteImagesStrict(publicIds);
  res.json({ success: true, deleted: publicIds.length });
});

module.exports = { deleteUploadedImage, upload, uploadImage, uploadImages };
