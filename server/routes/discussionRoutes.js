const express = require("express");
const multer = require("multer");
const AppError = require("../utils/AppError");
const {
  discussionAccess,
  clearChat,
  createPollMessage,
  getMessage,
  getMessages,
  getUnreadCount,
  markMessageRead,
  removeMessage,
  reactMessage,
  sendMessage,
  uploadDiscussionAttachment,
  votePollMessage,
} = require("../controllers/discussionController");

const router = express.Router();
const allowedDiscussionTypes = new Set([
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
const discussionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowedDiscussionTypes.has(file.mimetype)) {
      return cb(new AppError("Unsupported attachment type.", 400));
    }
    return cb(null, true);
  },
});

router.use(discussionAccess);

router.get("/messages", getMessages);
router.post("/messages", sendMessage);
router.delete("/messages", clearChat);
router.get("/messages/:id", getMessage);
router.put("/messages/:id/read", markMessageRead);
router.post("/messages/:id/reactions", reactMessage);
router.delete("/messages/:id", removeMessage);
router.post("/upload", discussionUpload.single("file"), uploadDiscussionAttachment);
router.post("/polls", createPollMessage);
router.post("/polls/:id/vote", votePollMessage);
router.get("/unread-count", getUnreadCount);

module.exports = router;
