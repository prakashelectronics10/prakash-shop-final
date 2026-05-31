const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const DiscussionMessage = require("../models/DiscussionMessage");
const DiscussionRoom = require("../models/DiscussionRoom");
const FileAsset = require("../models/FileAsset");
const Invoice = require("../models/Invoice");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { isSuperAdminEmail } = require("../middleware/auth");

const GLOBAL_ROOM_KEY = "global-admin-discussion";
const MAX_MESSAGE_LIMIT = 60;
const ADMIN_PUBLIC_FIELDS = "_id name email role tag avatar avatarUrl imageUrl profileImage photoUrl";
const INVOICE_DISCUSSION_FIELDS = "_id invoiceNumber invoiceDate dueDate paymentStatus status customer totals pdfUrl publicAccessToken";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function idString(value) {
  return String(value?._id || value || "");
}

function uniqueIds(values) {
  return [...new Set((values || []).map(idString).filter((value) => mongoose.Types.ObjectId.isValid(value)))];
}

function isMainAdmin(admin) {
  return Boolean(admin?.isSuperAdmin) ||
    isSuperAdminEmail(admin?.email) ||
    ["owner", "mainAdmin"].includes(String(admin?.role || ""));
}

function canUseDiscussion(admin) {
  if (!admin) return false;
  return isMainAdmin(admin) || Boolean(admin.adminAndroidAppAccess);
}

function requireDiscussionAccess(admin) {
  if (!canUseDiscussion(admin)) {
    throw new AppError("Admin Android app access is required for Discussion", 403);
  }
}

function compactMessage(message) {
  return String(message || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function roleLabel(admin) {
  if (!admin) return "Admin";
  if (isMainAdmin(admin)) return "Main Admin";
  const role = String(admin.role || admin.tag || "admin");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function serializeAdmin(admin) {
  if (!admin) return null;
  const avatar = admin.avatar || admin.avatarUrl || admin.imageUrl || admin.profileImage || admin.photoUrl || "";
  return {
    id: idString(admin),
    _id: idString(admin),
    name: admin.name || admin.email || "Admin",
    email: admin.email || "",
    role: admin.role || admin.tag || "admin",
    tag: admin.tag || "",
    avatar,
    avatarUrl: avatar,
    roleLabel: roleLabel(admin),
    isMainAdmin: isMainAdmin(admin),
  };
}

function serializeReceipt(receipt) {
  const admin = receipt?.admin;
  return {
    admin: typeof admin === "object" ? serializeAdmin(admin) : { id: idString(admin), _id: idString(admin) },
    adminId: idString(admin),
    at: receipt?.at,
  };
}

function serializeReply(reply) {
  if (!reply) return null;
  return {
    id: idString(reply),
    _id: idString(reply),
    message: reply.isDeleted ? "This message was deleted" : reply.message || "",
    type: reply.type || "text",
    senderAdmin: serializeAdmin(reply.senderAdmin),
    createdAt: reply.createdAt,
  };
}

function serializePoll(poll, currentAdminId = "") {
  if (!poll?.question) return null;
  const options = (poll.options || []).map((option) => {
    const voters = (option.voters || []).map(idString).filter(Boolean);
    const voterDetails = (option.voters || [])
      .filter((voter) => voter && typeof voter === "object" && voter._id)
      .map(serializeAdmin)
      .filter(Boolean);
    return {
      id: idString(option._id),
      _id: idString(option._id),
      text: option.text || "",
      voteCount: voters.length,
      votes: voters.length,
      voterIds: voters,
      voters: poll.anonymous ? [] : voters,
      voterDetails: poll.anonymous ? [] : voterDetails,
      selected: currentAdminId ? voters.includes(currentAdminId) : false,
    };
  });
  const voterIds = (poll.voters || []).map(idString).filter(Boolean);
  return {
    question: poll.question || "",
    options,
    voters: poll.anonymous ? [] : voterIds,
    voterIds,
    voterDetails: poll.anonymous
      ? []
      : (poll.voters || []).filter((voter) => voter && typeof voter === "object" && voter._id).map(serializeAdmin).filter(Boolean),
    totalVotes: options.reduce((sum, option) => sum + option.votes, 0),
    totalVoters: new Set(voterIds).size,
    allowMultiple: Boolean(poll.allowMultiple),
    anonymous: Boolean(poll.anonymous),
    expiresAt: poll.expiresAt || null,
    isClosed: poll.expiresAt ? new Date(poll.expiresAt).getTime() <= Date.now() : false,
  };
}

function serializeReaction(reaction) {
  const admins = (reaction.admins || []).map((entry) => ({
    admin: typeof entry.admin === "object" ? serializeAdmin(entry.admin) : { id: idString(entry.admin), _id: idString(entry.admin) },
    adminId: idString(entry.admin),
    at: entry.at,
  }));
  return {
    emoji: reaction.emoji || "",
    count: admins.length,
    admins,
  };
}

function serializeAttachment(attachment) {
  const fileName = attachment.fileName || attachment.name || attachment.originalName || "Attachment";
  return {
    type: attachment.type || "image",
    url: attachment.url || attachment.fileUrl || "",
    fileUrl: attachment.fileUrl || attachment.url || "",
    downloadUrl: attachment.downloadUrl || "",
    originalUrl: attachment.originalUrl || "",
    publicId: attachment.publicId || "",
    fileAsset: idString(attachment.fileAsset) || "",
    name: fileName,
    fileName,
    originalName: attachment.originalName || fileName,
    mimeType: attachment.mimeType || "",
    size: attachment.fileSize || attachment.size || 0,
    fileSize: attachment.fileSize || attachment.size || 0,
    fileType: attachment.fileType || attachment.type || "",
    storageProvider: attachment.storageProvider || "",
    width: attachment.width || null,
    height: attachment.height || null,
  };
}

function derivedInvoiceStatus(invoice) {
  const status = invoice?.status || invoice?.paymentStatus || "pending";
  if (status === "paid") return "paid";
  const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null;
  if (dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < new Date()) return "overdue";
  return status;
}

function invoicePdfPath(invoice) {
  if (!invoice) return "";
  if (invoice.pdfUrl) return invoice.pdfUrl;
  return invoice.publicAccessToken ? `/api/invoices/public/${invoice.publicAccessToken}/pdf` : "";
}

function serializeInvoiceSummary(invoice) {
  if (!invoice || typeof invoice !== "object" || !invoice._id) return null;
  return {
    id: idString(invoice),
    _id: idString(invoice),
    invoiceNumber: invoice.invoiceNumber || "Invoice",
    invoiceDate: invoice.invoiceDate || null,
    dueDate: invoice.dueDate || null,
    paymentStatus: invoice.paymentStatus || "pending",
    status: derivedInvoiceStatus(invoice),
    customer: {
      name: invoice.customer?.name || "Customer",
      phone: invoice.customer?.phone || "",
      address: invoice.customer?.address || "",
    },
    totals: {
      grandTotal: Number(invoice.totals?.grandTotal || 0),
      subtotal: Number(invoice.totals?.subtotal || 0),
    },
    pdfUrl: invoicePdfPath(invoice),
  };
}

function serializeMessage(message) {
  const sender = serializeAdmin(message.senderAdmin);
  const deleted = Boolean(message.isDeleted);
  const invoice = deleted ? null : serializeInvoiceSummary(message.relatedInvoice);
  return {
    id: idString(message),
    _id: idString(message),
    room: idString(message.room),
    senderAdmin: sender,
    senderName: sender?.name || "Admin",
    senderRole: sender?.roleLabel || "Admin",
    senderAvatar: sender?.avatar || "",
    message: deleted ? "This message was deleted" : message.message || "",
    clientId: message.clientId || "",
    attachments: deleted ? [] : (message.attachments || []).map(serializeAttachment),
    attachmentUrl: deleted ? "" : message.attachments?.[0]?.url || "",
    fileName: deleted ? "" : message.attachments?.[0]?.name || "",
    mimeType: deleted ? "" : message.attachments?.[0]?.mimeType || "",
    type: deleted ? "system" : message.type || "text",
    poll: deleted ? null : serializePoll(message.poll),
    mentions: (message.mentions || []).map((admin) => (typeof admin === "object" ? serializeAdmin(admin) : { id: idString(admin), _id: idString(admin) })),
    readBy: (message.readBy || []).map(serializeReceipt),
    deliveredTo: (message.deliveredTo || []).map(serializeReceipt),
    reactions: deleted ? [] : (message.reactions || []).map(serializeReaction).filter((reaction) => reaction.emoji && reaction.count),
    replyTo: serializeReply(message.replyTo),
    relatedBooking: idString(message.relatedBooking) || null,
    relatedProduct: idString(message.relatedProduct) || null,
    relatedInvoice: invoice?.id || idString(message.relatedInvoice) || null,
    invoice,
    isDeleted: deleted,
    deletedAt: message.deletedAt,
    deletedBy: idString(message.deletedBy) || null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

async function discussionAdmins() {
  const admins = await Admin.find({
    isActive: true,
    $or: [
      { adminAndroidAppAccess: true },
      { email: normalizeEmail(env.adminEmail) },
      { role: { $in: ["owner", "mainAdmin"] } },
    ],
  })
    .select("_id name email role tag adminAndroidAppAccess isActive avatar avatarUrl imageUrl profileImage photoUrl")
    .sort({ name: 1, email: 1 })
    .lean();

  return admins.map((admin) => ({
    ...admin,
    isSuperAdmin: isSuperAdminEmail(admin.email),
  }));
}

async function getGlobalRoom() {
  const participants = await discussionAdmins();
  const participantIds = participants.map((admin) => admin._id);

  const room = await DiscussionRoom.findOneAndUpdate(
    { key: GLOBAL_ROOM_KEY },
    {
      $setOnInsert: {
        key: GLOBAL_ROOM_KEY,
        name: "Admin Discussion",
        type: "global",
      },
      $set: {
        participants: participantIds,
      },
    },
    { new: true, upsert: true },
  ).lean();

  return { room, participants };
}

async function populateMessage(query) {
  const message = await query
    .populate("senderAdmin", ADMIN_PUBLIC_FIELDS)
    .populate("mentions", ADMIN_PUBLIC_FIELDS)
    .populate("readBy.admin", ADMIN_PUBLIC_FIELDS)
    .populate("deliveredTo.admin", ADMIN_PUBLIC_FIELDS)
    .populate("reactions.admins.admin", ADMIN_PUBLIC_FIELDS)
    .populate("poll.voters", ADMIN_PUBLIC_FIELDS)
    .populate("poll.options.voters", ADMIN_PUBLIC_FIELDS)
    .populate("relatedInvoice", INVOICE_DISCUSSION_FIELDS)
    .populate({
      path: "replyTo",
      select: "_id senderAdmin message type isDeleted createdAt",
      populate: { path: "senderAdmin", select: ADMIN_PUBLIC_FIELDS },
    })
    .lean();

  if (!message) return null;
  if (message.senderAdmin) message.senderAdmin.isSuperAdmin = isSuperAdminEmail(message.senderAdmin.email);
  (message.mentions || []).forEach((admin) => {
    admin.isSuperAdmin = isSuperAdminEmail(admin.email);
  });
  (message.readBy || []).forEach((receipt) => {
    if (receipt.admin) receipt.admin.isSuperAdmin = isSuperAdminEmail(receipt.admin.email);
  });
  (message.deliveredTo || []).forEach((receipt) => {
    if (receipt.admin) receipt.admin.isSuperAdmin = isSuperAdminEmail(receipt.admin.email);
  });
  if (message.replyTo?.senderAdmin) {
    message.replyTo.senderAdmin.isSuperAdmin = isSuperAdminEmail(message.replyTo.senderAdmin.email);
  }
  return message;
}

async function getMessageById(messageId) {
  if (!mongoose.Types.ObjectId.isValid(messageId)) return null;
  return populateMessage(DiscussionMessage.findById(messageId));
}

async function listMessages(admin, query = {}) {
  requireDiscussionAccess(admin);
  const { room } = await getGlobalRoom();
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 30, 1), MAX_MESSAGE_LIMIT);
  const cleared = (room.clearedFor || []).find((item) => idString(item.admin) === idString(admin));
  const filter = {
    room: room._id,
    hiddenFor: { $ne: admin._id },
  };
  if (cleared?.updatedAt) filter.createdAt = { $gt: cleared.updatedAt };

  if (query.before) {
    const beforeDate = new Date(query.before);
    if (!Number.isNaN(beforeDate.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $lt: beforeDate };
  }

  const search = String(query.search || "").trim();
  if (search) {
    const matchingAdmins = await Admin.find({
      isActive: true,
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id").lean();
    filter.isDeleted = false;
    filter.$or = [
      { message: { $regex: search, $options: "i" } },
      { senderAdmin: { $in: matchingAdmins.map((item) => item._id) } },
    ];
  }

  const messages = await DiscussionMessage.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderAdmin", ADMIN_PUBLIC_FIELDS)
    .populate("mentions", ADMIN_PUBLIC_FIELDS)
    .populate("readBy.admin", ADMIN_PUBLIC_FIELDS)
    .populate("deliveredTo.admin", ADMIN_PUBLIC_FIELDS)
    .populate("reactions.admins.admin", ADMIN_PUBLIC_FIELDS)
    .populate("poll.voters", ADMIN_PUBLIC_FIELDS)
    .populate("poll.options.voters", ADMIN_PUBLIC_FIELDS)
    .populate("relatedInvoice", INVOICE_DISCUSSION_FIELDS)
    .populate({
      path: "replyTo",
      select: "_id senderAdmin message type isDeleted createdAt",
      populate: { path: "senderAdmin", select: ADMIN_PUBLIC_FIELDS },
    })
    .lean();

  const normalized = messages.reverse().map((message) => {
    if (message.senderAdmin) message.senderAdmin.isSuperAdmin = isSuperAdminEmail(message.senderAdmin.email);
    return serializeMessage(message);
  });

  return {
    items: normalized,
    room: {
      id: idString(room),
      _id: idString(room),
      name: room.name,
      type: room.type,
    },
    hasMore: messages.length === limit,
  };
}

function normalizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((item) => {
      const url = item?.url || item?.fileUrl;
      return url && isAllowedAttachmentUrl(url);
    })
    .slice(0, 6)
    .map((item) => {
      const mimeType = String(item.mimeType || "").trim();
      const sourceType = String(item.type || item.fileType || "").trim();
      const isImage = sourceType === "image" || /^image\//i.test(mimeType);
      const isPdf = sourceType === "pdf" || mimeType === "application/pdf";
      const type = isImage ? "image" : isPdf ? "pdf" : "document";
      const fileName = String(item.fileName || item.name || item.originalName || "Attachment").trim();
      return {
        type,
        url: String(item.url || item.fileUrl || "").trim(),
        fileUrl: String(item.fileUrl || item.url || "").trim(),
        downloadUrl: String(item.downloadUrl || "").trim(),
        originalUrl: String(item.originalUrl || item.url || item.fileUrl || "").trim(),
        publicId: String(item.publicId || "").trim(),
        fileAsset: mongoose.Types.ObjectId.isValid(item.fileAsset || item.id || item._id) ? (item.fileAsset || item.id || item._id) : null,
        name: fileName,
        fileName,
        originalName: String(item.originalName || fileName).trim(),
        mimeType,
        size: Number(item.size || item.fileSize || 0),
        fileSize: Number(item.fileSize || item.size || 0),
        fileType: String(item.fileType || type).trim(),
        storageProvider: String(item.storageProvider || "").trim(),
        width: item.width || null,
        height: item.height || null,
      };
    });
}

function isAllowedAttachmentUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (/^(file|content|asset|data):/i.test(url)) return false;
  if (/^\/api\/files\/[a-f0-9]{24}\/(?:open|download)$/i.test(url)) return true;
  if (/^https?:\/\/[^/]+\/api\/files\/[a-f0-9]{24}\/(?:open|download)$/i.test(url)) return true;
  if (/^https?:\/\/res\.cloudinary\.com\//i.test(url) && /\/(?:image|raw|auto)\/upload\//i.test(url)) return true;
  if (/^https?:\/\/[^/]+\/(?:uploads|api\/uploads|static\/uploads)\//i.test(url)) return true;
  return /^https?:\/\/[^/]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?.*)?$/i.test(url);
}

function normalizeMessagePayload(payload = {}) {
  const message = String(payload.message || payload.text || "").trim();
  const clientId = String(payload.clientId || "").trim().slice(0, 120);
  const attachments = normalizeAttachments(payload.attachments);
  const type = attachments.length
    ? attachments[0].type
    : ["text", "image", "file", "document", "pdf", "invoice", "system"].includes(payload.type)
      ? payload.type
      : "text";

  return {
    message,
    clientId,
    attachments,
    type,
    mentions: uniqueIds(payload.mentions),
    replyTo: mongoose.Types.ObjectId.isValid(payload.replyTo) ? payload.replyTo : null,
    relatedBooking: mongoose.Types.ObjectId.isValid(payload.relatedBooking) ? payload.relatedBooking : null,
    relatedProduct: mongoose.Types.ObjectId.isValid(payload.relatedProduct) ? payload.relatedProduct : null,
    relatedInvoice: mongoose.Types.ObjectId.isValid(payload.relatedInvoice) ? payload.relatedInvoice : null,
  };
}

function normalizePollPayload(payload = {}) {
  const source = payload.poll || payload;
  const question = String(source.question || "").trim().slice(0, 400);
  const options = (Array.isArray(source.options) ? source.options : [])
    .map((option) => String(option?.text || option || "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((text) => ({ text: text.slice(0, 180), voters: [] }));
  if (!question) throw new AppError("Poll question is required", 400);
  if (options.length < 2) throw new AppError("Poll needs at least two options", 400);
  const expiresAt = source.expiresAt ? new Date(source.expiresAt) : null;
  return {
    question,
    options,
    voters: [],
    allowMultiple: Boolean(source.allowMultiple),
    anonymous: Boolean(source.anonymous),
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
  };
}

function deriveMentionIds(message, participants) {
  const text = String(message || "").toLowerCase();
  if (!text.includes("@")) return [];
  return uniqueIds((participants || [])
    .filter((admin) => {
      const name = String(admin.name || "").toLowerCase().trim();
      const firstName = name.split(/\s+/)[0];
      const emailUser = String(admin.email || "").toLowerCase().split("@")[0];
      return (name && text.includes(`@${name}`)) ||
        (firstName && text.includes(`@${firstName}`)) ||
        (emailUser && text.includes(`@${emailUser}`));
    })
    .map((admin) => admin._id));
}

async function setRoomUnread(roomId, adminId, count) {
  const safeCount = Math.max(Number(count) || 0, 0);
  const result = await DiscussionRoom.updateOne(
    { _id: roomId, "unreadCounts.admin": adminId },
    {
      $set: {
        "unreadCounts.$.count": safeCount,
        "unreadCounts.$.updatedAt": new Date(),
      },
    },
  );

  if (!result.matchedCount) {
    await DiscussionRoom.updateOne(
      { _id: roomId },
      {
        $push: {
          unreadCounts: {
            admin: adminId,
            count: safeCount,
            updatedAt: new Date(),
          },
        },
      },
    );
  }
}

async function unreadCount(admin) {
  requireDiscussionAccess(admin);
  const { room } = await getGlobalRoom();
  const adminId = idString(admin);
  const count = await DiscussionMessage.countDocuments({
    room: room._id,
    isDeleted: false,
    senderAdmin: { $ne: admin._id },
    hiddenFor: { $ne: admin._id },
    "readBy.admin": { $ne: admin._id },
  });
  await setRoomUnread(room._id, adminId, count);
  return { count, roomId: idString(room) };
}

async function createMessage(admin, payload = {}) {
  requireDiscussionAccess(admin);
  const { room, participants } = await getGlobalRoom();
  const normalized = normalizeMessagePayload(payload);
  if (normalized.type === "invoice") {
    if (!normalized.relatedInvoice) throw new AppError("Invoice is required", 400);
    const invoiceExists = await Invoice.exists({ _id: normalized.relatedInvoice });
    if (!invoiceExists) throw new AppError("Invoice not found", 404);
  }
  if (!normalized.message && !normalized.attachments.length && normalized.type !== "invoice") {
    throw new AppError("Message text or attachment is required", 400);
  }
  const mentions = normalized.mentions.length
    ? normalized.mentions
    : deriveMentionIds(normalized.message, participants);
  if (normalized.clientId) {
    const existing = await DiscussionMessage.findOne({
      room: room._id,
      senderAdmin: admin._id,
      clientId: normalized.clientId,
    }).select("_id").lean();
    if (existing) {
      return {
        room,
        participants,
        message: existing,
        recipientIds: [],
        duplicate: true,
      };
    }
  }

  const now = new Date();
  const message = await DiscussionMessage.create({
    room: room._id,
    senderAdmin: admin._id,
    message: normalized.message || (normalized.type === "invoice" ? "Invoice shared" : ""),
    clientId: normalized.clientId,
    attachments: normalized.attachments,
    type: normalized.type,
    mentions,
    readBy: [{ admin: admin._id, at: now }],
    deliveredTo: [{ admin: admin._id, at: now }],
    replyTo: normalized.replyTo,
    relatedBooking: normalized.relatedBooking,
    relatedProduct: normalized.relatedProduct,
    relatedInvoice: normalized.relatedInvoice,
  });

  const fileAssetIds = normalized.attachments.map((attachment) => attachment.fileAsset).filter(Boolean);
  if (fileAssetIds.length) {
    await FileAsset.updateMany(
      { _id: { $in: fileAssetIds } },
      {
        $set: {
          relatedType: "discussion",
          relatedId: message._id,
          relatedDiscussionMessage: message._id,
        },
      },
    );
  }

  const recipientIds = participants
    .map((participant) => idString(participant))
    .filter((id) => id && id !== idString(admin));

  await DiscussionRoom.updateOne(
    { _id: room._id },
    {
      $set: {
        lastMessage: message._id,
        updatedAt: now,
      },
    },
  );

  await Promise.all(recipientIds.map(async (adminId) => {
    const current = await DiscussionMessage.countDocuments({
      room: room._id,
      isDeleted: false,
      senderAdmin: { $ne: adminId },
      hiddenFor: { $ne: adminId },
      "readBy.admin": { $ne: adminId },
    });
    await setRoomUnread(room._id, adminId, current);
  }));

  return {
    room,
    participants,
    message,
    recipientIds,
  };
}

async function createPoll(admin, payload = {}) {
  requireDiscussionAccess(admin);
  const { room, participants } = await getGlobalRoom();
  const poll = normalizePollPayload(payload);
  const clientId = String(payload.clientId || "").trim().slice(0, 120);
  if (clientId) {
    const existing = await DiscussionMessage.findOne({
      room: room._id,
      senderAdmin: admin._id,
      clientId,
    }).select("_id").lean();
    if (existing) {
      return {
        room,
        participants,
        message: existing,
        recipientIds: [],
        duplicate: true,
      };
    }
  }
  const now = new Date();
  const message = await DiscussionMessage.create({
    room: room._id,
    senderAdmin: admin._id,
    message: poll.question,
    clientId,
    type: "poll",
    poll,
    readBy: [{ admin: admin._id, at: now }],
    deliveredTo: [{ admin: admin._id, at: now }],
  });

  const recipientIds = participants
    .map((participant) => idString(participant))
    .filter((id) => id && id !== idString(admin));

  await DiscussionRoom.updateOne(
    { _id: room._id },
    { $set: { lastMessage: message._id, updatedAt: now } },
  );

  await Promise.all(recipientIds.map(async (adminId) => {
    const current = await DiscussionMessage.countDocuments({
      room: room._id,
      isDeleted: false,
      senderAdmin: { $ne: adminId },
      hiddenFor: { $ne: adminId },
      "readBy.admin": { $ne: adminId },
    });
    await setRoomUnread(room._id, adminId, current);
  }));

  return { room, participants, message, recipientIds };
}

async function votePoll(admin, messageId, optionIds = []) {
  requireDiscussionAccess(admin);
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new AppError("Invalid poll id", 400);
  const requested = uniqueIds(Array.isArray(optionIds) ? optionIds : [optionIds]);
  if (!requested.length) throw new AppError("Select a poll option", 400);

  const message = await DiscussionMessage.findById(messageId);
  if (!message || message.type !== "poll" || !message.poll) throw new AppError("Poll not found", 404);
  if (message.poll.expiresAt && new Date(message.poll.expiresAt).getTime() <= Date.now()) {
    throw new AppError("Poll has ended", 400);
  }

  const adminId = idString(admin);
  const selected = message.poll.options.filter((option) => requested.includes(idString(option._id)));
  if (!selected.length) throw new AppError("Poll option not found", 404);
  if (!message.poll.allowMultiple && selected.length > 1) throw new AppError("Only one option can be selected", 400);
  if (!message.poll.allowMultiple) {
    const alreadySelected = selected.some((option) => (option.voters || []).map(idString).includes(adminId));
    message.poll.options.forEach((option) => {
      option.voters = (option.voters || []).filter((id) => idString(id) !== adminId);
    });
    if (!alreadySelected) selected[0].voters.push(admin._id);
  } else {
    selected.forEach((option) => {
      const hasVote = (option.voters || []).map(idString).includes(adminId);
      option.voters = hasVote
        ? (option.voters || []).filter((id) => idString(id) !== adminId)
        : [...(option.voters || []), admin._id];
    });
  }
  const stillVoted = message.poll.options.some((option) => (option.voters || []).map(idString).includes(adminId));
  message.poll.voters = stillVoted
    ? [...new Set([...(message.poll.voters || []).map(idString), adminId])]
    : (message.poll.voters || []).filter((id) => idString(id) !== adminId);
  message.markModified("poll");
  await message.save();

  const populated = await getMessageById(message._id);
  return serializeMessage(populated);
}

async function addReceipt(messageId, field, adminIds) {
  const ids = uniqueIds(adminIds);
  if (!ids.length || !mongoose.Types.ObjectId.isValid(messageId)) return null;

  const message = await DiscussionMessage.findById(messageId).select(`${field}.admin room`).lean();
  if (!message) return null;
  const existing = new Set((message[field] || []).map((receipt) => idString(receipt.admin)));
  const additions = ids.filter((id) => !existing.has(id));
  if (!additions.length) return message;

  await DiscussionMessage.updateOne(
    { _id: messageId },
    {
      $push: {
        [field]: {
          $each: additions.map((id) => ({ admin: id, at: new Date() })),
        },
      },
    },
  );

  return DiscussionMessage.findById(messageId).select(`${field}.admin room`).lean();
}

async function markDelivered(messageId, adminIds) {
  return addReceipt(messageId, "deliveredTo", adminIds);
}

async function markRead(admin, messageId) {
  requireDiscussionAccess(admin);
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new AppError("Invalid message id", 400);
  const updated = await addReceipt(messageId, "readBy", [admin._id]);
  if (!updated) throw new AppError("Message not found", 404);
  const count = await unreadCount(admin);
  return {
    messageId,
    admin: serializeAdmin(admin),
    readAt: new Date(),
    unreadCount: count.count,
    roomId: count.roomId,
  };
}

async function markAllRead(admin) {
  requireDiscussionAccess(admin);
  const { room } = await getGlobalRoom();
  const unread = await DiscussionMessage.find({
    room: room._id,
    isDeleted: false,
    senderAdmin: { $ne: admin._id },
    hiddenFor: { $ne: admin._id },
    "readBy.admin": { $ne: admin._id },
  }).select("_id").lean();

  if (unread.length) {
    await DiscussionMessage.updateMany(
      { _id: { $in: unread.map((item) => item._id) } },
      { $push: { readBy: { admin: admin._id, at: new Date() } } },
    );
  }

  await setRoomUnread(room._id, admin._id, 0);
  return {
    messageIds: unread.map((item) => idString(item)),
    admin: serializeAdmin(admin),
    readAt: new Date(),
    unreadCount: 0,
    roomId: idString(room),
  };
}

async function markAllDelivered(admin) {
  requireDiscussionAccess(admin);
  const { room } = await getGlobalRoom();
  const messages = await DiscussionMessage.find({
    room: room._id,
    isDeleted: false,
    senderAdmin: { $ne: admin._id },
    hiddenFor: { $ne: admin._id },
    "deliveredTo.admin": { $ne: admin._id },
  }).select("_id").limit(100).lean();

  if (!messages.length) return [];
  await DiscussionMessage.updateMany(
    { _id: { $in: messages.map((item) => item._id) } },
    { $push: { deliveredTo: { admin: admin._id, at: new Date() } } },
  );
  return messages.map((item) => idString(item));
}

async function deleteMessage(admin, messageId) {
  requireDiscussionAccess(admin);
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new AppError("Invalid message id", 400);

  const message = await DiscussionMessage.findById(messageId);
  if (!message) throw new AppError("Message not found", 404);

  const ownMessage = idString(message.senderAdmin) === idString(admin);
  if (!ownMessage && !isMainAdmin(admin)) {
    throw new AppError("Only the sender or Main Admin can delete this message", 403);
  }

  message.isDeleted = true;
  message.message = "";
  message.attachments = [];
  message.deletedBy = admin._id;
  message.deletedAt = new Date();
  await message.save();

  const populated = await getMessageById(message._id);
  return serializeMessage(populated);
}

async function hideMessageForAdmin(admin, messageId) {
  requireDiscussionAccess(admin);
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new AppError("Invalid message id", 400);
  const message = await DiscussionMessage.findByIdAndUpdate(
    messageId,
    { $addToSet: { hiddenFor: admin._id } },
    { new: true },
  ).lean();
  if (!message) throw new AppError("Message not found", 404);
  await unreadCount(admin);
  return { id: idString(message), _id: idString(message), hiddenForMe: true };
}

async function toggleReaction(admin, messageId, emoji) {
  requireDiscussionAccess(admin);
  if (!mongoose.Types.ObjectId.isValid(messageId)) throw new AppError("Invalid message id", 400);
  const safeEmoji = String(emoji || "").trim().slice(0, 16);
  if (!safeEmoji) throw new AppError("Reaction is required", 400);

  const message = await DiscussionMessage.findById(messageId);
  if (!message || message.isDeleted) throw new AppError("Message not found", 404);
  const adminId = idString(admin);
  const hadSameReaction = (message.reactions || []).some((reaction) =>
    reaction.emoji === safeEmoji && (reaction.admins || []).some((entry) => idString(entry.admin) === adminId));

  message.reactions = (message.reactions || [])
    .map((reaction) => ({
      emoji: reaction.emoji,
      admins: (reaction.admins || []).filter((entry) => idString(entry.admin) !== adminId),
    }))
    .filter((reaction) => reaction.admins.length);

  if (!hadSameReaction) {
    const targetIndex = message.reactions.findIndex((reaction) => reaction.emoji === safeEmoji);
    if (targetIndex === -1) {
      message.reactions.push({ emoji: safeEmoji, admins: [{ admin: admin._id, at: new Date() }] });
    } else {
      message.reactions[targetIndex].admins.push({ admin: admin._id, at: new Date() });
    }
  }
  message.markModified("reactions");
  await message.save();

  const populated = await getMessageById(message._id);
  const serialized = serializeMessage(populated);
  return {
    message: serialized,
    reaction: {
      action: hadSameReaction ? "removed" : "added",
      emoji: safeEmoji,
      reactorAdmin: serializeAdmin(admin),
      reactorAdminId: adminId,
      targetAdminId: idString(serialized.senderAdmin),
    },
  };
}

async function clearChatForAdmin(admin) {
  requireDiscussionAccess(admin);
  const { room } = await getGlobalRoom();
  const now = new Date();
  const result = await DiscussionRoom.updateOne(
    { _id: room._id, "clearedFor.admin": admin._id },
    { $set: { "clearedFor.$.updatedAt": now, "clearedFor.$.count": 0 } },
  );
  if (!result.matchedCount) {
    await DiscussionRoom.updateOne(
      { _id: room._id },
      { $push: { clearedFor: { admin: admin._id, count: 0, updatedAt: now } } },
    );
  }
  await setRoomUnread(room._id, idString(admin), 0);
  return { roomId: idString(room), clearedAt: now };
}

function pushPreview(serializedMessage) {
  if (serializedMessage.type === "invoice") return `sended a Invoice "${serializedMessage.invoice?.invoiceNumber || "Invoice"}"`;
  if (serializedMessage.type === "poll") return `Poll: ${compactMessage(serializedMessage.poll?.question || serializedMessage.message)}`;
  if (serializedMessage.attachments?.length && !serializedMessage.message) {
    if (["document", "pdf", "file"].includes(serializedMessage.attachments[0].type)) return "sent a document";
    return "sent an image";
  }
  return compactMessage(serializedMessage.message || "New message");
}

module.exports = {
  GLOBAL_ROOM_KEY,
  canUseDiscussion,
  clearChatForAdmin,
  compactMessage,
  createMessage,
  createPoll,
  deleteMessage,
  discussionAdmins,
  getGlobalRoom,
  getMessageById,
  hideMessageForAdmin,
  isMainAdmin,
  listMessages,
  markAllDelivered,
  markAllRead,
  markDelivered,
  markRead,
  pushPreview,
  requireDiscussionAccess,
  serializeAdmin,
  serializeMessage,
  toggleReaction,
  votePoll,
  unreadCount,
};
