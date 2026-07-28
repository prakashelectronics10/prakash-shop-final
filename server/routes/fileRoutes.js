const express = require("express");
const multer = require("multer");
const AppError = require("../utils/AppError");
const { downloadFile, getFile, streamFile, uploadFile } = require("../controllers/fileController");

const allowedFileTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowedFileTypes.has(file.mimetype)) {
      return cb(new AppError("Unsupported file type.", 400));
    }
    return cb(null, true);
  },
});

const router = express.Router();

router.post("/upload", upload.single("file"), uploadFile);
router.get("/:id", getFile);
router.get("/:id/open", streamFile);
router.get("/:id/download", downloadFile);

module.exports = router;
