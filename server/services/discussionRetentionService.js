const DiscussionMessage = require("../models/DiscussionMessage");
const FileAsset = require("../models/FileAsset");
const { deleteResources } = require("./cloudinaryService");
const { isConnected } = require("../config/db");
const { logger } = require("../utils/logger");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

let cleanupTimer = null;
let cleanupRunning = false;

function attachmentResource(attachment) {
  if (!attachment?.publicId) return null;
  return {
    publicId: attachment.publicId,
    resourceType: attachment.type === "image" ? "image" : "raw",
  };
}

async function cleanupDiscussionOlderThanMonth() {
  if (cleanupRunning || !isConnected()) return { deletedCount: 0, skipped: !isConnected() };
  cleanupRunning = true;
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * ONE_DAY_MS);
    const messages = await DiscussionMessage.find({ createdAt: { $lt: cutoff } })
      .select("_id attachments")
      .lean();

    const resources = messages
      .flatMap((message) => message.attachments || [])
      .map(attachmentResource)
      .filter(Boolean);

    if (resources.length) {
      const deletedAssets = await deleteResources(resources);
      const failed = deletedAssets.filter((result) => result.status === "rejected");
      if (failed.length) logger.warn("discussion.retention.cloudinary_partial", { failed: failed.length });
    }

    const result = messages.length
      ? await DiscussionMessage.deleteMany({ _id: { $in: messages.map((message) => message._id) } })
      : { deletedCount: 0 };
    if (messages.length) {
      await FileAsset.deleteMany({ relatedDiscussionMessage: { $in: messages.map((message) => message._id) } });
    }

    if (result.deletedCount) {
      logger.info("discussion.retention.deleted", { deletedCount: result.deletedCount, cutoff: cutoff.toISOString() });
    }
    return { deletedCount: result.deletedCount || 0, cutoff };
  } catch (error) {
    logger.error("discussion.retention.failed", { error: error.message });
    return { deletedCount: 0, error: error.message };
  } finally {
    cleanupRunning = false;
  }
}

function startDiscussionRetentionCleanup() {
  if (cleanupTimer) return cleanupTimer;
  setTimeout(() => cleanupDiscussionOlderThanMonth(), 30 * 1000).unref?.();
  cleanupTimer = setInterval(cleanupDiscussionOlderThanMonth, ONE_DAY_MS);
  cleanupTimer.unref?.();
  return cleanupTimer;
}

module.exports = { cleanupDiscussionOlderThanMonth, startDiscussionRetentionCleanup };
