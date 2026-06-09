const Admin = require("../models/Admin");
const Notification = require("../models/Notification");
const env = require("../config/env");
const { sendPushToAdmins } = require("./mobilePushService");
const { emitNotificationToAdmins } = require("./discussionSocket");

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

function cleanText(value, fallback = "") {
  return String(value || fallback || "").replace(/\s+/g, " ").trim();
}

function safeImageUrl(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  return url.replace(/^http:\/\//i, "https://");
}

function bookingImageUrl(booking) {
  return safeImageUrl(
    booking.imageUrl ||
    booking.images?.find((image) => image?.url)?.url ||
    booking.productImageUrl ||
    booking.productImage ||
    booking.products?.find((product) => product?.productImageUrl)?.productImageUrl,
  );
}

function bookingProductsLabel(booking) {
  const products = Array.isArray(booking.products) ? booking.products.filter((item) => item?.productName) : [];
  if (products.length) {
    return products
      .slice(0, 3)
      .map((product) => `${cleanText(product.productName)}${Number(product.quantity || 1) > 1 ? ` x${product.quantity}` : ""}`)
      .join(", ");
  }
  return cleanText(booking.productName || bookingTitle(booking), "Repair booking");
}

function bookingIntentLabel(booking) {
  const source = cleanText(booking.bookingSource).toLowerCase();
  if (source.includes("cart") || source.includes("shop")) return "Buy";
  if (booking.productName || booking.products?.length) return "Buy/Repair";
  return "Repair";
}

function bookingPushBody(booking) {
  return [
    `Name: ${cleanText(booking.fullName, "Customer")}`,
    `Phone: ${cleanText(booking.phoneNumber, "N/A")}`,
    `Email: ${cleanText(booking.customerEmail, "N/A")}`,
    `Product: ${bookingProductsLabel(booking)}`,
    `Type: ${bookingIntentLabel(booking)} - ${cleanText(booking.repairType, "General")}`,
  ].join("\n");
}

async function createNotification(payload) {
  const notification = await Notification.create(payload);
  console.log("[notification] Saved notification:", {
    notificationId: String(notification._id),
    targetAdmin: String(payload.targetAdmin || ""),
    type: notification.type,
  });
  await sendPushToAdmins([payload.targetAdmin], notification);
  const unreadCount = await Notification.countDocuments({ targetAdmin: payload.targetAdmin, isRead: false });
  emitNotificationToAdmins([payload.targetAdmin], "notification:new", { notification, unreadCount });
  emitNotificationToAdmins([payload.targetAdmin], "notification:unread-count", { unreadCount });
  return notification;
}

async function notifyAdmins({ type, title, message, permission, relatedBooking = null, metadata = {} }) {
  const admins = await mobileEnabledAdmins(permission);
  if (!admins.length) return [];

  const notifications = await Notification.insertMany(admins.map((admin) => ({
    type,
    title,
    message,
    body: message,
    targetAdmin: admin._id,
    receiverAdmins: [admin._id],
    relatedBooking,
    bookingId: relatedBooking,
    screen: metadata.screen || "notifications",
    deepLinkData: metadata.pushData || {},
    metadata,
  })));

  await Promise.all(notifications.map((notification) => sendPushToAdmins([notification.targetAdmin], {
    ...notification.toObject?.() || notification,
    data: {
      notificationId: String(notification._id),
      ...(metadata.pushData || {}),
    },
    channelId: metadata.channelId || "bookings",
  })));
  await Promise.all(notifications.map(async (notification) => {
    const unreadCount = await Notification.countDocuments({ targetAdmin: notification.targetAdmin, isRead: false });
    emitNotificationToAdmins([notification.targetAdmin], "notification:new", { notification, unreadCount });
    emitNotificationToAdmins([notification.targetAdmin], "notification:unread-count", { unreadCount });
  }));
  return notifications;
}

async function notifyBookingCreated(booking) {
  const admins = await mobileEnabledAdmins();

  const title = "New Booking Received";
  const repairType = booking.repairType || booking.productName || bookingTitle(booking);
  const message = bookingPushBody(booking);
  const image = bookingImageUrl(booking);
  const metadata = {
    customerName: cleanText(booking.fullName),
    customerEmail: cleanText(booking.customerEmail),
    status: booking.status,
    phoneNumber: booking.phoneNumber,
    productName: bookingProductsLabel(booking),
    repairType: cleanText(repairType),
    intent: bookingIntentLabel(booking),
    bookingSource: booking.bookingSource,
    image,
    requestedAt: booking.requestedAt || booking.createdAt,
  };
  const pushData = {
    type: "booking",
    bookingId: String(booking._id),
    customerName: cleanText(booking.fullName),
    customerEmail: cleanText(booking.customerEmail),
    phoneNumber: cleanText(booking.phoneNumber),
    productName: bookingProductsLabel(booking),
    repairType: cleanText(repairType),
    intent: bookingIntentLabel(booking),
    image,
    screen: "BookingDetail",
  };

  console.log("[push] Booking notification admin lookup:", {
    bookingId: String(booking._id),
    adminCount: admins.length,
    adminIds: admins.map((admin) => String(admin._id)),
  });

  if (!admins.length) return [];

  const notifications = (await Promise.all(admins.map(async (admin) => {
    const existing = await Notification.findOne({
      type: "booking",
      targetAdmin: admin._id,
      relatedBooking: booking._id,
    });
    if (existing) {
      console.log("[notification] Duplicate booking notification prevented:", {
        bookingId: String(booking._id),
        targetAdmin: String(admin._id),
        notificationId: String(existing._id),
      });
      existing.isRead = false;
      existing.readAt = undefined;
      existing.title = title;
      existing.message = message;
      existing.body = message;
      existing.image = image;
      existing.deepLinkData = { ...pushData, notificationId: String(existing._id) };
      existing.metadata = { ...metadata, duplicatePreventedAt: new Date() };
      await existing.save();
      return { notification: existing, shouldPush: false };
    }
    const notification = await Notification.create({
      type: "booking",
      title,
      message,
      body: message,
      targetAdmin: admin._id,
      receiverAdmins: [admin._id],
      relatedBooking: booking._id,
      bookingId: booking._id,
      image,
      icon: "calendar",
      screen: "BookingDetail",
      deepLinkData: pushData,
      metadata,
    });
    return { notification, shouldPush: true };
  }))).filter(Boolean);

  await Promise.all(notifications.filter((item) => item.shouldPush).map(({ notification }) => {
    console.log("[push] Booking push notification triggered:", {
      bookingId: String(booking._id),
      notificationId: String(notification._id),
      targetAdmin: String(notification.targetAdmin),
      source: "notifyBookingCreated",
    });
    return sendPushToAdmins([notification.targetAdmin], {
      ...(notification.toObject?.() || notification),
      data: {
        notificationId: String(notification._id),
        ...pushData,
      },
      channelId: "bookings",
    });
  }));

  await Promise.all(notifications.map(async ({ notification }) => {
    const unreadCount = await Notification.countDocuments({ targetAdmin: notification.targetAdmin, isRead: false });
    emitNotificationToAdmins([notification.targetAdmin], "notification:new", { notification, unreadCount });
    emitNotificationToAdmins([notification.targetAdmin], "notification:unread-count", { unreadCount });
  }));

  return notifications.map((item) => item.notification);
}

async function notifyReviewCreated({ name, phone, email, message, reviewRating }) {
  if (!reviewRating) return [];
  const body = [
    `Name: ${cleanText(name, "Customer")}`,
    `Phone: ${cleanText(phone, "N/A")}`,
    `Email: ${cleanText(email, "N/A")}`,
    `Rating: ${reviewRating}/5`,
    cleanText(message) ? `Message: ${cleanText(message).slice(0, 220)}` : "",
  ].filter(Boolean).join("\n");
  return notifyAdmins({
    type: "review",
    title: "New Review Received",
    message: body,
    metadata: {
      name,
      phone,
      email,
      message,
      reviewRating,
      channelId: "system_alerts",
      pushData: {
        screen: "notifications",
        type: "review",
        reviewRating,
      },
    },
  });
}

async function notifyAndroidAccessRequested(requestedAdmin) {
  const mainAdmin = await mainAdminAccount();
  if (!mainAdmin) return null;

  const existing = await Notification.findOne({
    type: { $in: ["admin_request", "android_access_request"] },
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
    existing.body = existing.message;
    existing.screen = "AdminRequestDetail";
    existing.adminRequestId = requestedAdmin._id;
    existing.receiverAdmins = [mainAdmin._id];
    existing.deepLinkData = {
      screen: "AdminRequestDetail",
      notificationId: String(existing._id),
      adminRequestId: String(requestedAdmin._id),
      type: "admin_request",
    };
    existing.metadata = {
      requestedAdminEmail: requestedAdmin.email,
      requestedAdminName: requestedAdmin.name || "",
      requestedAt: new Date(),
    };
    await existing.save();
    if (!suppressPush) {
      await sendPushToAdmins([mainAdmin._id], existing);
    }
    const unreadCount = await Notification.countDocuments({ targetAdmin: mainAdmin._id, isRead: false });
    emitNotificationToAdmins([mainAdmin._id], "notification:new", { notification: existing, unreadCount });
    emitNotificationToAdmins([mainAdmin._id], "notification:unread-count", { unreadCount });
    return existing;
  }

  return createNotification({
    type: "admin_request",
    title: "Android app access request",
    message: `${requestedAdmin.name || requestedAdmin.email} requested Admin Android App Access.`,
    body: `${requestedAdmin.name || requestedAdmin.email} requested Admin Android App Access.`,
    targetAdmin: mainAdmin._id,
    receiverAdmins: [mainAdmin._id],
    requestedAdmin: requestedAdmin._id,
    adminRequestId: requestedAdmin._id,
    actionStatus: "pending",
    screen: "AdminRequestDetail",
    deepLinkData: {
      screen: "AdminRequestDetail",
      adminRequestId: String(requestedAdmin._id),
      type: "admin_request",
    },
    metadata: {
      requestedAdminEmail: requestedAdmin.email,
      requestedAdminName: requestedAdmin.name || "",
      requestedAt: new Date(),
      channelId: "admin_requests",
    },
  });
}

async function notifySystemAlert({ title, message, type = "system", targetAdmins = [], metadata = {} }) {
  const admins = targetAdmins.length ? targetAdmins : await mobileEnabledAdmins();
  const adminIds = admins.map((admin) => admin._id || admin).filter(Boolean);
  if (!adminIds.length) return [];
  const notifications = await Notification.insertMany(adminIds.map((adminId) => ({
    type,
    title,
    message,
    body: message,
    targetAdmin: adminId,
    receiverAdmins: [adminId],
    screen: metadata.screen || "notifications",
    deepLinkData: metadata.pushData || { screen: "notifications", type },
    metadata: {
      ...metadata,
      channelId: metadata.channelId || "system_alerts",
    },
  })));
  await Promise.all(notifications.map(async (notification) => {
    await sendPushToAdmins([notification.targetAdmin], {
      ...(notification.toObject?.() || notification),
      channelId: metadata.channelId || "system_alerts",
    });
    const unreadCount = await Notification.countDocuments({ targetAdmin: notification.targetAdmin, isRead: false });
    emitNotificationToAdmins([notification.targetAdmin], "notification:new", { notification, unreadCount });
    emitNotificationToAdmins([notification.targetAdmin], "notification:unread-count", { unreadCount });
  }));
  return notifications;
}

async function notifyAndroidAccessGranted(requestedAdmin, grantedBy) {
  return createNotification({
    type: "success",
    title: "Android app access granted",
    message: `Your Android app access was granted by ${grantedBy.name || grantedBy.email}.`,
    targetAdmin: requestedAdmin._id,
    receiverAdmins: [requestedAdmin._id],
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
  notifySystemAlert,
};
