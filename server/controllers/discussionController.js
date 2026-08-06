const {
  createMessage,
  createPoll,
  clearChatForAdmin,
  deleteMessage,
  discussionAdmins,
  discussionSettings,
  getMessageById,
  hideMessageForAdmin,
  listMessages,
  markAllRead,
  markRead,
  pinMessage,
  requireDiscussionAccess,
  serializeAdmin,
  serializeMessage,
  toggleReaction,
  unpinMessage,
  unreadCount,
  updateDiscussionSendPermission,
  votePoll,
} = require("../services/discussionService");
const { publishDeletedMessage, publishDiscussionPermissions, publishMessagePinUpdated, publishMessageReaction, publishNewMessage, publishPollUpdated, publishReadReceipt } = require("../services/discussionSocket");
const { uploadBuffer } = require("../services/cloudinaryService");
const { createFileAssetFromUpload, serializeFileAsset } = require("../services/fileAssetService");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

function discussionAccess(req, _res, next) {
  try {
    requireDiscussionAccess(req.admin);
    next();
  } catch (error) {
    next(error);
  }
}

const getMessages = asyncHandler(async (req, res) => {
  const data = await listMessages(req.admin, req.query);
  const [unread, admins] = await Promise.all([
    unreadCount(req.admin),
    discussionAdmins(),
  ]);

  res.json({
    success: true,
    data: {
      ...data,
      admins: admins.map(serializeAdmin),
      unreadCount: unread.count,
    },
  });
});

const sendMessage = asyncHandler(async (req, res) => {
  const bundle = await createMessage(req.admin, req.body);
  const message = await publishNewMessage(bundle, req.admin);

  res.status(201).json({
    success: true,
    data: message,
  });
});

const markMessageRead = asyncHandler(async (req, res) => {
  const receipt = req.params.id === "all"
    ? await markAllRead(req.admin)
    : await markRead(req.admin, req.params.id);
  publishReadReceipt(receipt);

  res.json({
    success: true,
    data: receipt,
  });
});

const removeMessage = asyncHandler(async (req, res) => {
  const scope = String(req.query.scope || req.body?.scope || "everyone");
  if (scope === "me") {
    const hidden = await hideMessageForAdmin(req.admin, req.params.id);
    res.json({ success: true, data: hidden });
    return;
  }
  const message = await deleteMessage(req.admin, req.params.id);
  publishDeletedMessage(message);

  res.json({
    success: true,
    data: message,
  });
});

const clearChat = asyncHandler(async (req, res) => {
  const data = await clearChatForAdmin(req.admin);
  res.json({ success: true, data });
});

const createPollMessage = asyncHandler(async (req, res) => {
  const bundle = await createPoll(req.admin, req.body);
  const message = await publishNewMessage(bundle, req.admin);
  res.status(201).json({ success: true, data: message });
});

const votePollMessage = asyncHandler(async (req, res) => {
  const message = await votePoll(req.admin, req.params.id, req.body.optionIds || req.body.optionId);
  publishPollUpdated(message);
  res.json({ success: true, data: message });
});

const reactMessage = asyncHandler(async (req, res) => {
  const result = await toggleReaction(req.admin, req.params.id, req.body.emoji);
  await publishMessageReaction(result.message, result.reaction);
  res.json({ success: true, data: result.message });
});

const uploadDiscussionAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("Attachment file is required", 400);
  const isImage = /^image\//i.test(req.file.mimetype || "");
  const isPdf = req.file.mimetype === "application/pdf";

  const uploaded = await uploadBuffer(req.file.buffer, {
    folder: "discussion",
    resourceType: isImage ? "image" : "raw",
    deliveryWidth: 1400,
  });
  const asset = await createFileAssetFromUpload(uploaded, req.file, {
    folder: "discussion",
    uploadedBy: req.admin?._id,
    relatedType: "discussion",
  });
  const file = serializeFileAsset(asset);

  res.status(201).json({
    success: true,
    data: {
      ...file,
      type: isImage ? "image" : isPdf ? "pdf" : "document",
      url: uploaded.secure_url,
      fileUrl: uploaded.secure_url,
      downloadUrl: uploaded.original_secure_url || uploaded.secure_url,
      originalUrl: uploaded.original_secure_url || uploaded.secure_url,
      publicId: uploaded.public_id,
      fileAsset: file.id,
      name: file.fileName,
      fileName: file.fileName,
      originalName: file.originalName,
      mimeType: req.file.mimetype || uploaded.resource_type || (isImage ? "image/jpeg" : "application/octet-stream"),
      size: file.fileSize,
      fileSize: file.fileSize,
      storageProvider: file.storageProvider,
      fileType: file.fileType,
      width: uploaded.width || null,
      height: uploaded.height || null,
    },
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const data = await unreadCount(req.admin);
  res.json({
    success: true,
    data,
  });
});

const getSettings = asyncHandler(async (req, res) => {
  const data = await discussionSettings(req.admin);
  res.json({ success: true, data });
});

const updateSendPermission = asyncHandler(async (req, res) => {
  const canSend = req.body?.canSend !== false && req.body?.sendingDisabled !== true;
  const data = await updateDiscussionSendPermission(req.admin, req.params.adminId, canSend);
  publishDiscussionPermissions(data);
  res.json({ success: true, data });
});

const getMessage = asyncHandler(async (req, res) => {
  const message = await getMessageById(req.params.id);
  if (!message) throw new AppError("Message not found", 404);
  res.json({
    success: true,
    data: serializeMessage(message),
  });
});

const pinDiscussionMessage = asyncHandler(async (req, res) => {
  const scope = req.body?.scope === "global" || req.body?.visibleToEveryone ? "global" : "private";
  const message = await pinMessage(req.admin, req.params.id, scope);
  publishMessagePinUpdated(message, scope, req.admin);
  res.json({ success: true, data: message });
});

const unpinDiscussionMessage = asyncHandler(async (req, res) => {
  const scope = req.query?.scope === "global" || req.body?.scope === "global" ? "global" : "private";
  const message = await unpinMessage(req.admin, req.params.id, scope);
  publishMessagePinUpdated(message, scope, req.admin);
  res.json({ success: true, data: message });
});

module.exports = {
  discussionAccess,
  getMessage,
  getMessages,
  getSettings,
  getUnreadCount,
  markMessageRead,
  clearChat,
  createPollMessage,
  pinDiscussionMessage,
  removeMessage,
  reactMessage,
  sendMessage,
  unpinDiscussionMessage,
  updateSendPermission,
  uploadDiscussionAttachment,
  votePollMessage,
};
