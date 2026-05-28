const Admin = require("../models/Admin");
const Notification = require("../models/Notification");
const env = require("../config/env");
const { sendPushToAdmins } = require("./mobilePushService");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isMainAdmin(admin) {
  return normalizeEmail(admin?.email) === normalizeEmail(env.adminEmail);
}

function hasPermission(admin, permission) {
  if (!permission) return true;
  if (isMainAdmin(admin)) return true;
  return (admin.permissions || []).includes(permission);
}

async function mobileEnabledAdmins(permission) {
  const admins = await Admin.find({
    isActive: true,
    $or: [
      { adminAndroidAppAccess: true },
      { email: normalizeEmail(env.adminEmail) },
    ],
  }).select("_id email permissions adminAndroidAppAccess").lean();

  return admins.filter((admin) => hasPermission(admin, permission));
}

async function mainAdminAccount() {
  return Admin.findOne({ email: normalizeEmail(env.adminEmail), isActive: true })
    .select("_id email name tag")
    .lean();
}

function bookingTitle(booking) {
  const products = Array.isArray(booking.products) ? booking.products.filter((item) => item?.productName) : [];
  if (products.length === 1) return products[0].productName;
  if (products.length > 1) return `${products.length} products booking`;
  return booking.productName || booking.repairType || "Repair booking";
}

async function createNotification(payload) {
  const notification = await Notification.create(payload);
  await sendPushToAdmins([payload.targetAdmin], notification);
  return notification;
}

async function notifyAdmins({ type, title, message, permission, relatedBooking = null, metadata = {} }) {
  const admins = await mobileEnabledAdmins(permission);
  if (!admins.length) return [];

  const notifications = await Notification.insertMany(admins.map((admin) => ({
    type,
    title,
    message,
    targetAdmin: admin._id,
    relatedBooking,
    metadata,
  })));

  await Promise.all(notifications.map((notification) => sendPushToAdmins([notification.targetAdmin], notification)));
  return notifications;
}

async function notifyBookingCreated(booking) {
  return notifyAdmins({
    type: "booking",
    permission: "bookings",
    title: "New booking received",
    message: `${booking.fullName || "Customer"} requested ${bookingTitle(booking)}.`,
    relatedBooking: booking._id,
    metadata: {
      status: booking.status,
      phoneNumber: booking.phoneNumber,
      bookingSource: booking.bookingSource,
      requestedAt: booking.requestedAt || booking.createdAt,
    },
  });
}

async function notifyReviewCreated({ name, phone, email, message, reviewRating }) {
  if (!reviewRating) return [];
  return notifyAdmins({
    type: "review",
    permission: "testimonials",
    title: "New customer review",
    message: `${name || "Customer"} submitted a ${reviewRating}-star review.`,
    metadata: {
      name,
      phone,
      email,
      message,
      reviewRating,
    },
  });
}

async function notifyAndroidAccessRequested(requestedAdmin) {
  const mainAdmin = await mainAdminAccount();
  if (!mainAdmin) return null;

  const existing = await Notification.findOne({
    type: "android_access_request",
    targetAdmin: mainAdmin._id,
    requestedAdmin: requestedAdmin._id,
    actionStatus: "pending",
  });

  if (existing) {
    const lastRequestedAt = existing.metadata?.requestedAt ? new Date(existing.metadata.requestedAt).getTime() : 0;
    const suppressPush = lastRequestedAt && Date.now() - lastRequestedAt < 10 * 60 * 1000;
    existing.isRead = false;
    existing.readAt = undefined;
    existing.message = `${requestedAdmin.name || requestedAdmin.email} requested Admin Android App Access.`;
    existing.metadata = {
      requestedAdminEmail: requestedAdmin.email,
      requestedAdminName: requestedAdmin.name || "",
      requestedAt: new Date(),
    };
    await existing.save();
    if (!suppressPush) {
      await sendPushToAdmins([mainAdmin._id], existing);
    }
    return existing;
  }

  return createNotification({
    type: "android_access_request",
    title: "Android app access request",
    message: `${requestedAdmin.name || requestedAdmin.email} requested Admin Android App Access.`,
    targetAdmin: mainAdmin._id,
    requestedAdmin: requestedAdmin._id,
    actionStatus: "pending",
    metadata: {
      requestedAdminEmail: requestedAdmin.email,
      requestedAdminName: requestedAdmin.name || "",
      requestedAt: new Date(),
    },
  });
}

async function notifyAndroidAccessGranted(requestedAdmin, grantedBy) {
  return createNotification({
    type: "android_access_granted",
    title: "Android app access granted",
    message: `Your Android app access was granted by ${grantedBy.name || grantedBy.email}.`,
    targetAdmin: requestedAdmin._id,
    requestedAdmin: requestedAdmin._id,
    actionStatus: "granted",
    metadata: {
      grantedBy: grantedBy.email,
      grantedAt: new Date(),
    },
  });
}

module.exports = {
  createNotification,
  mainAdminAccount,
  notifyAndroidAccessGranted,
  notifyAndroidAccessRequested,
  notifyBookingCreated,
  notifyReviewCreated,
};
