const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const Admin = require("../models/Admin");
const env = require("../config/env");
const { logger } = require("../utils/logger");
const { isSuperAdminEmail } = require("../middleware/auth");
const { validateAdminSession } = require("./adminSessionService");
const { sendPushToAdmins } = require("./mobilePushService");
const {
  GLOBAL_ROOM_KEY,
  canUseDiscussion,
  createMessage,
  createPoll,
  deleteMessage,
  getMessageById,
  hideMessageForAdmin,
  markAllDelivered,
  markAllRead,
  markDelivered,
  markRead,
  pushPreview,
  serializeAdmin,
  serializeMessage,
  toggleReaction,
  unreadCount,
  votePoll,
} = require("./discussionService");

const DISCUSSION_ROOM = `discussion:${GLOBAL_ROOM_KEY}`;

let ioInstance = null;
const onlineAdmins = new Map();
const onlineAdminProfiles = new Map();

function idString(value) {
  return String(value?._id || value || "");
}

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (env.nodeEnv !== "production" && /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)$/i.test(url.hostname)) {
      return true;
    }
    return url.protocol === "https:" && url.hostname.endsWith(".onrender.com");
  } catch (_error) {
    return false;
  }
}

function getSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (authToken) return String(authToken);
  const authorization = String(socket.handshake.headers?.authorization || "");
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return "";
}

async function authenticateSocket(socket, next) {
  try {
    const token = getSocketToken(socket);
    if (!token) throw new Error("Admin login required");

    const payload = jwt.verify(token, env.jwtSecret);
    await validateAdminSession(payload);

    const admin = await Admin.findOne({ _id: payload.sub, isActive: true })
      .select("_id name email role tag permissions adminAndroidAppAccess isActive avatar avatarUrl imageUrl profileImage photoUrl")
      .lean();
    if (!admin) throw new Error("Admin account is not active");

    admin.isSuperAdmin = isSuperAdminEmail(admin.email);
    if (!canUseDiscussion(admin)) throw new Error("Admin Android app access is required for Discussion");

    socket.admin = admin;
    return next();
  } catch (error) {
    logger.warn("discussion.socket_auth_failed", { error: error.message });
    return next(new Error(error.message || "Discussion authentication failed"));
  }
}

function onlineAdminIds() {
  return [...onlineAdmins.entries()]
    .filter(([, sockets]) => sockets.size > 0)
    .map(([adminId]) => adminId);
}

function onlineUsersPayload() {
  const users = onlineAdminIds()
    .map((adminId) => onlineAdminProfiles.get(adminId))
    .filter(Boolean)
    .map((admin) => ({
      ...serializeAdmin(admin),
      isOnline: true,
    }));

  return {
    onlineAdminIds: users.map((user) => user._id),
    onlineCount: users.length,
    users,
  };
}

function emitOnlineUsers() {
  if (!ioInstance) return;
  const payload = onlineUsersPayload();
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:online-users", payload);
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:presence", payload);
}

function addOnlineSocket(adminId, socketId, admin) {
  const sockets = onlineAdmins.get(adminId) || new Set();
  sockets.add(socketId);
  onlineAdmins.set(adminId, sockets);
  onlineAdminProfiles.set(adminId, admin);
}

function removeOnlineSocket(adminId, socketId) {
  const sockets = onlineAdmins.get(adminId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size) onlineAdmins.set(adminId, sockets);
  else {
    onlineAdmins.delete(adminId);
    onlineAdminProfiles.delete(adminId);
  }
}

async function emitUnreadCounts(adminIds) {
  if (!ioInstance) return;
  const ids = [...new Set((adminIds || []).map(idString).filter(Boolean))];
  await Promise.all(ids.map(async (adminId) => {
    const sockets = onlineAdmins.get(adminId);
    if (!sockets?.size) return;
    const admin = await Admin.findById(adminId)
      .select("_id name email role tag adminAndroidAppAccess avatar avatarUrl imageUrl profileImage photoUrl")
      .lean();
    if (!admin) return;
    admin.isSuperAdmin = isSuperAdminEmail(admin.email);
    if (!canUseDiscussion(admin)) return;
    const data = await unreadCount(admin);
    sockets.forEach((socketId) => {
      ioInstance.to(socketId).emit("discussion:unread-count", data);
    });
  }));
}

async function sendOfflinePush(bundle, serializedMessage, senderAdmin) {
  const online = new Set(onlineAdminIds());
  const offlineRecipients = (bundle.recipientIds || []).filter((adminId) => !online.has(idString(adminId)));
  if (!offlineRecipients.length) return;

  await sendPushToAdmins(offlineRecipients, {
    title: "New Discussion Message",
    message: `${senderAdmin.name || senderAdmin.email || "Admin"}: ${pushPreview(serializedMessage)}`,
    type: "discussion",
    _id: serializedMessage.id,
    categoryId: "discussion-message",
    data: {
      screen: "discussion",
      messageId: serializedMessage.id,
      roomId: serializedMessage.room,
      type: "discussion",
    },
  });
}

async function publishNewMessage(bundle, senderAdmin) {
  if (!ioInstance) {
    const populated = await getMessageById(bundle.message._id);
    return serializeMessage(populated);
  }

  let populated = await getMessageById(bundle.message._id);
  let serialized = serializeMessage(populated);

  if (bundle.duplicate) {
    return serialized;
  }

  const online = new Set(onlineAdminIds());
  const deliveredRecipients = (bundle.recipientIds || []).filter((adminId) => online.has(idString(adminId)));
  if (deliveredRecipients.length) {
    await markDelivered(bundle.message._id, deliveredRecipients);
    populated = await getMessageById(bundle.message._id);
    serialized = serializeMessage(populated);
  }

  logger.info("discussion.message_emit", {
    messageId: serialized.id,
    senderAdmin: idString(senderAdmin),
    onlineRecipients: deliveredRecipients.length,
  });
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:new-message", serialized);
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:message", serialized);
  if (deliveredRecipients.length) {
    const deliveredPayload = {
      adminIds: deliveredRecipients.map(idString),
      messageIds: [serialized.id],
      deliveredAt: new Date(),
    };
    ioInstance.to(DISCUSSION_ROOM).emit("discussion:message-delivered", deliveredPayload);
    ioInstance.to(DISCUSSION_ROOM).emit("discussion:delivered", deliveredPayload);
  }
  await sendOfflinePush(bundle, serialized, senderAdmin);
  await emitUnreadCounts(bundle.recipientIds);
  return serialized;
}

function publishReadReceipt(receipt) {
  if (!ioInstance || !receipt) return;
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:message-read", receipt);
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:read", receipt);
  emitUnreadCounts([receipt.admin?.id || receipt.adminId || receipt.admin?._id]).catch(() => null);
}

function publishDeletedMessage(message) {
  if (!ioInstance || !message) return;
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:message-deleted", message);
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:deleted", message);
  emitUnreadCounts(onlineAdminIds()).catch(() => null);
}

function publishPollUpdated(message) {
  if (!ioInstance || !message) return;
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:poll-updated", message);
}

function publishMessageReaction(message) {
  if (!ioInstance || !message) return;
  ioInstance.to(DISCUSSION_ROOM).emit("discussion:reaction-updated", message);
}

async function handleConnected(socket) {
  const adminId = idString(socket.admin);
  addOnlineSocket(adminId, socket.id, socket.admin);
  socket.join(DISCUSSION_ROOM);
  logger.info("discussion.socket_connected", {
    adminId,
    adminName: socket.admin?.name || socket.admin?.email,
    socketId: socket.id,
  });
  socket.emit("discussion:connected", {
    admin: serializeAdmin(socket.admin),
    ...onlineUsersPayload(),
  });
  emitOnlineUsers();

  markAllDelivered(socket.admin)
    .then((messageIds) => {
      if (messageIds.length) {
        ioInstance.to(DISCUSSION_ROOM).emit("discussion:delivered", {
          admin: serializeAdmin(socket.admin),
          messageIds,
          deliveredAt: new Date(),
        });
      }
    })
    .catch((error) => logger.warn("discussion.mark_delivered_failed", { error: error.message }));

  socket.on("discussion:join", async (_payload = {}, ack) => {
    socket.join(DISCUSSION_ROOM);
    logger.info("discussion.room_joined", {
      adminId,
      room: GLOBAL_ROOM_KEY,
      socketId: socket.id,
    });
    const count = await unreadCount(socket.admin).catch(() => ({ count: 0 }));
    const payload = onlineUsersPayload();
    socket.emit("discussion:online-users", payload);
    ack?.({ success: true, data: { ...count, onlineUsers: payload.users, onlineCount: payload.onlineCount } });
  });

  const handleSendMessage = async (payload = {}, ack) => {
    try {
      const bundle = await createMessage(socket.admin, payload);
      const message = await publishNewMessage(bundle, socket.admin);
      logger.info("discussion.message_sent", {
        adminId,
        messageId: message.id,
        duplicate: Boolean(bundle.duplicate),
      });
      ack?.({ success: true, data: message });
    } catch (error) {
      ack?.({ success: false, message: error.message });
      socket.emit("discussion:error", { message: error.message });
    }
  };

  socket.on("discussion:send-message", handleSendMessage);
  socket.on("discussion:send", handleSendMessage);

  const handleCreatePoll = async (payload = {}, ack) => {
    try {
      const bundle = await createPoll(socket.admin, payload);
      const message = await publishNewMessage(bundle, socket.admin);
      ioInstance.to(DISCUSSION_ROOM).emit("discussion:new-poll", message);
      ack?.({ success: true, data: message });
    } catch (error) {
      ack?.({ success: false, message: error.message });
      socket.emit("discussion:error", { message: error.message });
    }
  };

  const handleVotePoll = async (payload = {}, ack) => {
    try {
      const message = await votePoll(socket.admin, payload.messageId || payload.pollId, payload.optionIds || payload.optionId);
      publishPollUpdated(message);
      ack?.({ success: true, data: message });
    } catch (error) {
      ack?.({ success: false, message: error.message });
      socket.emit("discussion:error", { message: error.message });
    }
  };

  socket.on("discussion:create-poll", handleCreatePoll);
  socket.on("discussion:vote-poll", handleVotePoll);

  const handleReaction = async (payload = {}, ack) => {
    try {
      const message = await toggleReaction(socket.admin, payload.messageId, payload.emoji);
      publishMessageReaction(message);
      ack?.({ success: true, data: message });
    } catch (error) {
      ack?.({ success: false, message: error.message });
      socket.emit("discussion:error", { message: error.message });
    }
  };

  socket.on("discussion:react-message", handleReaction);

  const emitTyping = (isTyping) => {
    const payload = {
      admin: serializeAdmin(socket.admin),
      isTyping,
      at: new Date(),
    };
    socket.to(DISCUSSION_ROOM).emit(isTyping ? "discussion:typing-start" : "discussion:typing-stop", payload);
    socket.to(DISCUSSION_ROOM).emit("discussion:typing", payload);
  };

  socket.on("discussion:typing-start", () => emitTyping(true));
  socket.on("discussion:typing-stop", () => emitTyping(false));
  socket.on("discussion:typing", (payload = {}) => emitTyping(Boolean(payload.isTyping)));

  const handleMarkRead = async (payload = {}, ack) => {
    try {
      const receipt = payload.messageId === "all" || payload.all
        ? await markAllRead(socket.admin)
        : await markRead(socket.admin, payload.messageId);
      publishReadReceipt(receipt);
      ack?.({ success: true, data: receipt });
    } catch (error) {
      ack?.({ success: false, message: error.message });
    }
  };

  socket.on("discussion:mark-read", handleMarkRead);
  socket.on("discussion:read", handleMarkRead);

  const handleDelete = async (payload = {}, ack) => {
    try {
      if (payload.scope === "me") {
        const hidden = await hideMessageForAdmin(socket.admin, payload.messageId);
        ack?.({ success: true, data: hidden });
        return;
      }
      const message = await deleteMessage(socket.admin, payload.messageId);
      publishDeletedMessage(message);
      ack?.({ success: true, data: message });
    } catch (error) {
      ack?.({ success: false, message: error.message });
      socket.emit("discussion:error", { message: error.message });
    }
  };

  socket.on("discussion:delete-message", handleDelete);
  socket.on("discussion:delete", handleDelete);

  socket.on("disconnect", () => {
    removeOnlineSocket(adminId, socket.id);
    logger.info("discussion.socket_disconnected", {
      adminId,
      adminName: socket.admin?.name || socket.admin?.email,
      socketId: socket.id,
    });
    emitOnlineUsers();
  });
}

function setupDiscussionSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked origin: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  ioInstance.use(authenticateSocket);
  ioInstance.on("connection", (socket) => {
    handleConnected(socket).catch((error) => {
      logger.warn("discussion.socket_connection_failed", { error: error.message });
      socket.disconnect(true);
    });
  });

  logger.info("discussion.socket_ready");
  return ioInstance;
}

module.exports = {
  DISCUSSION_ROOM,
  onlineAdminIds,
  publishDeletedMessage,
  publishNewMessage,
  publishMessageReaction,
  publishPollUpdated,
  publishReadReceipt,
  setupDiscussionSocket,
};
