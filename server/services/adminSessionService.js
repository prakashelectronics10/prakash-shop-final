const crypto = require("crypto");
const AdminSession = require("../models/AdminSession");
const MaintenanceMarker = require("../models/MaintenanceMarker");
const AppError = require("../utils/AppError");

const ADMIN_SESSION_CLEANUP_MARKER = "admin-session-cleanup-2026-09-06";

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

async function createAdminSession(admin, req, clientType = "web") {
  const safeClientType = normalizeClientType(clientType);
  const jwtId = crypto.randomUUID();
  const session = await AdminSession.create({
    admin: admin._id,
    jwtIdHash: hashValue(jwtId),
    clientType: safeClientType,
    ...getDeviceInfo(req),
    // Sessions are revoked explicitly (logout, password reset, disabled admin).
    // This far-future value retains compatibility with the existing indexed schema.
    expiresAt: new Date("2099-12-31T23:59:59.999Z"),
    lastSeenAt: new Date(),
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

async function revokeAllAdminSessionsOnce(reason = ADMIN_SESSION_CLEANUP_MARKER) {
  let marker;
  try {
    marker = await MaintenanceMarker.create({
      key: ADMIN_SESSION_CLEANUP_MARKER,
      details: {
        reason,
        status: "started",
      },
    });
  } catch (error) {
    if (error.code === 11000) return { skipped: true, modifiedCount: 0 };
    throw error;
  }

  try {
    const result = await AdminSession.updateMany(
      { isActive: true },
      {
        $set: {
          isActive: false,
          revokedAt: new Date(),
          revokeReason: reason,
        },
      },
    );

    marker.completedAt = new Date();
    marker.details = {
      reason,
      status: "completed",
      modifiedCount: result.modifiedCount || 0,
    };
    await marker.save();

    return { skipped: false, modifiedCount: result.modifiedCount || 0 };
  } catch (error) {
    await MaintenanceMarker.deleteOne({ key: ADMIN_SESSION_CLEANUP_MARKER }).catch(() => undefined);
    throw error;
  }
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
    const exclusiveSessionIndexes = indexes.filter((index) => (
      index.unique
      && index.key?.admin === 1
      && index.key?.isActive === 1
    ));

    for (const index of exclusiveSessionIndexes) {
      if (index.name) await AdminSession.collection.dropIndex(index.name);
    }

    await AdminSession.collection.createIndex(
      { admin: 1, isActive: 1, lastSeenAt: -1 },
      {
        name: "admin_1_isActive_1_lastSeenAt_-1",
      },
    );
    // Mongoose creates this schema index as `key_1` in development. Creating
    // the same key/options here under a different custom name makes MongoDB
    // reject startup with IndexKeySpecsConflict. Reuse any equivalent unique
    // index and only create the canonical index when the collection is new.
    const markerIndexes = await MaintenanceMarker.collection.indexes().catch((indexError) => {
      if (indexError.code === 26 || indexError.codeName === "NamespaceNotFound") return [];
      throw indexError;
    });
    const markerKeyIndex = markerIndexes.find((index) => {
      const keys = Object.entries(index.key || {});
      return keys.length === 1 && keys[0][0] === "key" && keys[0][1] === 1;
    });

    if (markerKeyIndex && !markerKeyIndex.unique) {
      throw new Error(`Maintenance marker index ${markerKeyIndex.name} must be unique`);
    }
    if (!markerKeyIndex) {
      await MaintenanceMarker.collection.createIndex(
        { key: 1 },
        { unique: true, name: "key_1" },
      );
    }
  } catch (error) {
    if (error.codeName !== "IndexNotFound") throw error;
  }
}

module.exports = {
  createAdminSession,
  ensureAdminSessionIndexes,
  expireExpiredSessions,
  getDeviceInfo,
  hashValue,
  normalizeClientType,
  revokeAdminSessions,
  revokeAllAdminSessionsOnce,
  revokeSession,
  validateAdminSession,
};
