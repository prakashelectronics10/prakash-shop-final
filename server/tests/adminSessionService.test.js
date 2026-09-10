const test = require("node:test");
const assert = require("node:assert/strict");

const AdminSession = require("../models/AdminSession");
const MaintenanceMarker = require("../models/MaintenanceMarker");
const {
  createAdminSession,
  ensureAdminSessionIndexes,
  revokeAdminSessions,
} = require("../services/adminSessionService");

function requestFor(userAgent, ip) {
  return {
    ip,
    headers: { "user-agent": userAgent },
    socket: { remoteAddress: ip },
  };
}

test("creates independent active sessions for the same admin on multiple devices", async (t) => {
  const originalCreate = AdminSession.create;
  const created = [];
  AdminSession.create = async (payload) => {
    created.push(payload);
    return { _id: `session-${created.length}`, ...payload };
  };
  t.after(() => { AdminSession.create = originalCreate; });

  const admin = { _id: "admin-1" };
  const first = await createAdminSession(admin, requestFor("Browser A", "203.0.113.1"), "web");
  const second = await createAdminSession(admin, requestFor("Browser B", "203.0.113.2"), "web");

  assert.equal(created.length, 2);
  assert.equal(created[0].admin, admin._id);
  assert.equal(created[1].admin, admin._id);
  assert.equal(created[0].clientType, "web");
  assert.ok(created[0].expiresAt > new Date());
  assert.notEqual(first.jwtId, second.jwtId);
  assert.notEqual(first.session._id, second.session._id);
  assert.notEqual(created[0].userAgentHash, created[1].userAgentHash);
});

test("session schema has no unique index that limits an admin to one active device", () => {
  const indexes = AdminSession.schema.indexes();
  const exclusiveIndex = indexes.find(([keys, options]) => (
    options?.unique
    && keys?.admin === 1
    && keys?.isActive === 1
  ));
  assert.equal(exclusiveIndex, undefined);
});

test("startup migration removes legacy exclusive indexes and creates a non-unique lookup index", async (t) => {
  const originals = {
    updateMany: AdminSession.updateMany,
    indexes: AdminSession.collection.indexes,
    dropIndex: AdminSession.collection.dropIndex,
    createIndex: AdminSession.collection.createIndex,
    markerIndexes: MaintenanceMarker.collection.indexes,
  };
  const dropped = [];
  const created = [];

  AdminSession.updateMany = async () => ({ modifiedCount: 0 });
  AdminSession.collection.indexes = async () => [
    { name: "_id_", key: { _id: 1 }, unique: true },
    { name: "admin_1_isActive_1", key: { admin: 1, isActive: 1 }, unique: true },
    { name: "admin_1_clientType_1_isActive_1", key: { admin: 1, clientType: 1, isActive: 1 }, unique: true },
  ];
  AdminSession.collection.dropIndex = async (name) => { dropped.push(name); };
  AdminSession.collection.createIndex = async (keys, options) => { created.push({ keys, options }); };
  MaintenanceMarker.collection.indexes = async () => [
    { name: "key_1", key: { key: 1 }, unique: true },
  ];
  t.after(() => {
    AdminSession.updateMany = originals.updateMany;
    AdminSession.collection.indexes = originals.indexes;
    AdminSession.collection.dropIndex = originals.dropIndex;
    AdminSession.collection.createIndex = originals.createIndex;
    MaintenanceMarker.collection.indexes = originals.markerIndexes;
  });

  await ensureAdminSessionIndexes();

  assert.deepEqual(dropped.sort(), ["admin_1_clientType_1_isActive_1", "admin_1_isActive_1"]);
  assert.deepEqual(created, [{
    keys: { admin: 1, isActive: 1, lastSeenAt: -1 },
    options: { name: "admin_1_isActive_1_lastSeenAt_-1" },
  }]);
});

test("main-admin security actions still revoke every active session for an admin", async (t) => {
  const originalUpdateMany = AdminSession.updateMany;
  let call;
  AdminSession.updateMany = async (filter, update) => {
    call = { filter, update };
    return { modifiedCount: 3 };
  };
  t.after(() => { AdminSession.updateMany = originalUpdateMany; });

  await revokeAdminSessions("admin-1", "admin-disabled");

  assert.deepEqual(call.filter, { admin: "admin-1", isActive: true });
  assert.equal(call.update.$set.isActive, false);
  assert.equal(call.update.$set.revokeReason, "admin-disabled");
  assert.ok(call.update.$set.revokedAt instanceof Date);
});
