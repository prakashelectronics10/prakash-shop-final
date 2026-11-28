const test = require("node:test");
const assert = require("node:assert/strict");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const NotificationEmail = require("../models/NotificationEmail");
const WebSetting = require("../models/WebSetting");
const env = require("../config/env");
const mail = require("../services/mailService");
const app = require("../services/mobileNotificationService");

const emails = [];
const appNotifications = [];
let appAvailable = true;
mail.isEmailConfigured = () => true;
mail.sendMail = async (message) => {
  emails.push(message.to);
  return { provider: "test", messageId: "email-1" };
};
app.notifyBookingCreated = async (booking) => {
  appNotifications.push(booking._id);
  if (!appAvailable) throw new Error("App unavailable");
};

const { deliverNextVoiceBookingNotification } = require("../services/bookingNotificationService");
const { createRepairBooking } = require("../services/whatsappRepairBookingService");

test("voice repair creation durably queues email and app delivery once, and retries a failed channel", async (t) => {
  const bookingId = "66b000000000000000000001";
  const originalAdminEmail = env.adminEmail;
  env.adminEmail = "voice-admin@example.com";
  t.after(() => { env.adminEmail = originalAdminEmail; appAvailable = true; });

  let stored;
  t.mock.method(Booking, "create", async (data) => {
    if (stored) throw Object.assign(new Error("Duplicate"), { code: 11000 });
    stored = { ...data, async save() {} };
    return stored;
  });
  t.mock.method(Booking, "findById", async () => stored);
  t.mock.method(Booking, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.bookingSource, "whatsapp-voice");
    if (!(stored.voiceNotificationNextAttemptAt <= filter.voiceNotificationNextAttemptAt.$lte) || stored.voiceNotificationClaimUntil) return null;
    Object.assign(stored, update.$set);
    stored.voiceNotificationAttempts = (stored.voiceNotificationAttempts || 0) + update.$inc.voiceNotificationAttempts;
    return stored;
  });
  t.mock.method(Booking, "updateOne", async (filter, update) => {
    assert.equal(filter.voiceNotificationClaimUntil, stored.voiceNotificationClaimUntil);
    Object.assign(stored, update.$set);
    for (const key of Object.keys(update.$unset)) delete stored[key];
  });
  const empty = { select: () => ({ lean: async () => [] }) };
  t.mock.method(Admin, "find", () => empty);
  t.mock.method(NotificationEmail, "find", () => empty);
  t.mock.method(NotificationEmail, "updateMany", async () => {});
  t.mock.method(WebSetting, "findOne", () => ({ lean: async () => null }));

  const details = { id: bookingId, data: { fullName: "Test Caller", phoneNumber: "9876543210", repairType: "Mixer" }, source: "whatsapp-voice" };
  assert.equal(await createRepairBooking(details), stored);
  assert.equal(await createRepairBooking(details), stored);
  assert.equal(stored.emailNotification.status, "queued");
  assert.deepEqual(emails, []);
  assert.deepEqual(appNotifications, []);

  appAvailable = false;
  const start = stored.voiceNotificationNextAttemptAt;
  assert.equal(await deliverNextVoiceBookingNotification(start), true);
  assert.equal(await deliverNextVoiceBookingNotification(start), false);
  assert.deepEqual(emails, ["voice-admin@example.com"]);
  assert.deepEqual(appNotifications, [bookingId]);

  appAvailable = true;
  const retry = stored.voiceNotificationNextAttemptAt;
  assert.equal(await deliverNextVoiceBookingNotification(retry), true);
  assert.equal(await deliverNextVoiceBookingNotification(retry), false);
  assert.deepEqual(appNotifications, [bookingId, bookingId]);
  assert.deepEqual(emails, ["voice-admin@example.com"]);
  assert.equal(stored.voiceNotificationNextAttemptAt, undefined);
  assert.equal(stored.voiceNotificationAttempts, 2);
  assert.equal(stored.voiceAppNotifiedAt, retry);
});
