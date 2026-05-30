const crypto = require("crypto");
const AdminSession = require("../models/AdminSession");
const env = require("../config/env");
const AppError = require("../utils/AppError");

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function getRequestIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "";
}

function getDeviceInfo(req) {
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 240);
  return {
    userAgentHash: hashValue(userAgent),
    ipHash: hashValue(getRequestIp(req)),
    deviceLabel: userAgent || "Unknown browser",
  };
}

function normalizeClientType(clientType = "web") {
  return clientType === "mobile" ? "mobile" : "web";
}

function sessionConflictMessage(clientType) {
  return clientType === "mobile"
    ? "This Admin is already logged in on another mobile app device"
    : "This Admin is already logged in on another website admin panel";
}

async function expireExpiredSessions(adminId) {
  const filter = {
    isActive: true,
    expiresAt: { $lte: new Date() },
  };

  if (adminId) {
    filter.admin = adminId;
  }

  await AdminSession.updateMany(filter, {
    $set: {
      isActive: false,
      revokedAt: new Date(),
      revokeReason: "expired",
    },
  });
}

async function getActiveSession(adminId, clientType = "web") {
  await expireExpiredSessions(adminId);
  return AdminSession.findOne({
    admin: adminId,
    clientType: normalizeClientType(clientType),
    isActive: true,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
}

function isSameDeviceSession(session, req) {
  const deviceInfo = getDeviceInfo(req);
  if (session.userAgentHash !== deviceInfo.userAgentHash) return false;
  if (!env.adminSessionBindIp) return true;
  return session.ipHash === deviceInfo.ipHash;
}

async function assertNoOtherDeviceSession(adminId, req, clientType = "web") {
  const safeClientType = normalizeClientType(clientType);
  const existingSession = await getActiveSession(adminId, safeClientType);
  if (existingSession && !isSameDeviceSession(existingSession, req)) {
    throw new AppError(sessionConflictMessage(safeClientType), 409);
  }

  return existingSession;
}

async function createAdminSession(admin, req, clientType = "web") {
  const safeClientType = normalizeClientType(clientType);
  const existingSession = await assertNoOtherDeviceSession(admin._id, req, safeClientType);
  if (existingSession) {
    await revokeSession(existingSession._id, "same-device-relogin");
  }

  const jwtId = crypto.randomUUID();
  const session = await AdminSession.create({
    admin: admin._id,
    jwtIdHash: hashValue(jwtId),
    clientType: safeClientType,
    ...getDeviceInfo(req),
    expiresAt: new Date(Date.now() + env.cookieMaxAgeMs),
    lastSeenAt: new Date(),
  }).catch((error) => {
    if (error.code === 11000) {
      throw new AppError(sessionConflictMessage(safeClientType), 409);
    }
    throw error;
  });

  return { session, jwtId };
}

async function validateAdminSession(payload) {
  if (!payload?.sid || !payload?.jti || !payload?.sub) {
    throw new AppError("Invalid admin session", 401);
  }

  const session = await AdminSession.findOne({
    _id: payload.sid,
    admin: payload.sub,
    isActive: true,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!session || session.jwtIdHash !== hashValue(payload.jti)) {
    throw new AppError("Session expired. Please login again.", 401);
  }
  if (payload.clientType && session.clientType && payload.clientType !== session.clientType) {
    throw new AppError("Session expired. Please login again.", 401);
  }

  session.lastSeenAt = new Date();
  await session.save();
  return session;
}

async function revokeSession(sessionId, reason = "logout") {
  if (!sessionId) return;
  await AdminSession.findByIdAndUpdate(sessionId, {
    isActive: false,
    revokedAt: new Date(),
    revokeReason: reason,
  });
}

async function revokeAdminSessions(adminId, reason = "admin-updated") {
  if (!adminId) return;
  await AdminSession.updateMany(
    { admin: adminId, isActive: true },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
      },
    },
  );
}

async function ensureAdminSessionIndexes() {
  try {
    await AdminSession.updateMany(
      {
        clientType: { $exists: false },
        deviceLabel: { $regex: /(okhttp|reactnative|react-native|expo|dalvik|cfnetwork)/i },
      },
      { $set: { clientType: "mobile" } },
    );
    await AdminSession.updateMany(
      { clientType: { $exists: false } },
      { $set: { clientType: "web" } },
    );

    const indexes = await AdminSession.collection.indexes();
    const oldIndex = indexes.find((index) =>
      index.unique &&
      index.key?.admin === 1 &&
      index.key?.isActive === 1 &&
      !Object.prototype.hasOwnProperty.call(index.key, "clientType"));

    if (oldIndex?.name) {
      await AdminSession.collection.dropIndex(oldIndex.name);
    }

    await AdminSession.collection.createIndex(
      { admin: 1, clientType: 1, isActive: 1 },
      {
        unique: true,
        partialFilterExpression: { isActive: true },
        name: "admin_clientType_active_unique",
      },
    );
  } catch (error) {
    if (error.codeName !== "IndexNotFound") throw error;
  }
}

module.exports = {
  assertNoOtherDeviceSession,
  createAdminSession,
  ensureAdminSessionIndexes,
  expireExpiredSessions,
  getActiveSession,
  getDeviceInfo,
  hashValue,
  isSameDeviceSession,
  normalizeClientType,
  revokeAdminSessions,
  revokeSession,
  validateAdminSession,
};
