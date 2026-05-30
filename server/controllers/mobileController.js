const Admin = require("../models/Admin");
const Notification = require("../models/Notification");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { isSuperAdminEmail } = require("../middleware/auth");
const {
  ensureJwtSecret,
  publicAdmin,
  signToken,
} = require("./authController");
const {
  assertNoOtherDeviceSession,
  createAdminSession,
  revokeSession,
} = require("../services/adminSessionService");
const {
  createOtpChallenge,
  maskEmail,
  resendOtpChallenge,
  verifyOtpChallenge,
} = require("../services/adminOtpService");
const {
  notifyAndroidAccessGranted,
  notifyAndroidAccessRequested,
} = require("../services/mobileNotificationService");
const { isExpoPushToken } = require("../services/mobilePushService");
const { emitNotificationToAdmins } = require("../services/discussionSocket");
const {
  collectPublicIdsFromSources,
  deleteImagesStrict,
  uploadBuffer,
} = require("../services/cloudinaryService");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hasAndroidAccess(admin) {
  return isSuperAdminEmail(admin.email) || Boolean(admin.adminAndroidAppAccess);
}

function deniedPayload(admin) {
  return {
    success: false,
    code: "ANDROID_ACCESS_DENIED",
    message: "Access Denied",
    subMessage: "You do not have access to this app.",
    admin: {
      id: admin._id,
      name: admin.name || "",
      email: admin.email,
      tag: isSuperAdminEmail(admin.email) ? "main owner" : admin.tag || admin.role || "admin",
    },
  };
}

async function findVerifiedAdmin(email, password) {
  const admin = await Admin.findOne({ email: normalizeEmail(email), isActive: true }).select("+passwordHash");
  if (!admin) throw new AppError("Invalid email or password", 401);

  const matches = await admin.comparePassword(password);
  if (!matches) throw new AppError("Invalid email or password", 401);
  return admin;
}

const login = asyncHandler(async (req, res) => {
  ensureJwtSecret();
  const admin = await findVerifiedAdmin(req.body.email, req.body.password);

  if (!hasAndroidAccess(admin)) {
    res.status(403).json(deniedPayload(admin));
    return;
  }

  await assertNoOtherDeviceSession(admin._id, req, "mobile");
  const challenge = await createOtpChallenge({
    admin,
    purpose: "mobile-login",
    req,
  });

  res.json({
    success: true,
    requiresOtp: true,
    challengeId: challenge._id,
    expiresAt: challenge.expiresAt,
    email: maskEmail(admin.email),
    admin: publicAdmin(admin),
    message: "OTP sent to verified admin email",
  });
});

const verifyLoginOtp = asyncHandler(async (req, res) => {
  ensureJwtSecret();
  const challenge = await verifyOtpChallenge({
    challengeId: req.body.challengeId,
    otp: req.body.otp,
    purpose: "mobile-login",
  });

  const admin = await Admin.findOne({ _id: challenge.admin, isActive: true });
  if (!admin) throw new AppError("Admin account is not active", 401);
  if (!hasAndroidAccess(admin)) {
    res.status(403).json(deniedPayload(admin));
    return;
  }

  const { session, jwtId } = await createAdminSession(admin, req, "mobile");
  admin.lastLoginAt = new Date();
  admin.lastMobileLogin = new Date();
  await admin.save();

  res.json({
    success: true,
    token: signToken(admin, session, jwtId),
    admin: publicAdmin(admin),
  });
});

const resendLoginOtp = asyncHandler(async (req, res) => {
  const challenge = await resendOtpChallenge({
    challengeId: req.body.challengeId,
    purpose: "mobile-login",
  });

  res.json({
    success: true,
    challengeId: challenge._id,
    expiresAt: challenge.expiresAt,
    email: maskEmail(challenge.email),
    message: "OTP resent to verified admin email",
  });
});

const requestAndroidAccess = asyncHandler(async (req, res) => {
  const admin = await findVerifiedAdmin(req.body.email, req.body.password);

  if (hasAndroidAccess(admin)) {
    res.json({ success: true, alreadyGranted: true, message: "Android app access is already enabled." });
    return;
  }

  admin.mobileAccessRequestedAt = new Date();
  await admin.save();

  const notification = await notifyAndroidAccessRequested(admin);
  res.status(202).json({
    success: true,
    message: "Access request sent to Main Admin",
    notificationId: notification?._id || "",
  });
});

const me = asyncHandler(async (req, res) => {
  if (!hasAndroidAccess(req.admin)) {
    res.status(403).json(deniedPayload(req.admin));
    return;
  }
  res.json({ success: true, admin: publicAdmin(req.admin) });
});

const updateProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("Profile logo image is required", 400);

  const admin = await Admin.findOne({ _id: req.admin._id, isActive: true });
  if (!admin) throw new AppError("Admin account is not active", 401);

  const previousPublicIds = collectPublicIdsFromSources(admin.avatarPublicId, admin.avatarUrl);
  const uploaded = await uploadBuffer(req.file.buffer);
  admin.avatarUrl = uploaded.secure_url;
  admin.avatarPublicId = uploaded.public_id;
  await admin.save();

  if (previousPublicIds.length) {
    deleteImagesStrict(previousPublicIds).catch((error) => {
      console.warn("Previous admin profile logo cleanup failed:", {
        adminId: String(admin._id),
        error: error.message,
      });
    });
  }

  const safeAdmin = publicAdmin(admin);
  res.json({
    success: true,
    data: {
      url: admin.avatarUrl,
      publicId: admin.avatarPublicId,
      admin: safeAdmin,
    },
    admin: safeAdmin,
  });
});

const logout = asyncHandler(async (req, res) => {
  await revokeSession(req.adminSession?._id, "mobile-logout");
  res.json({ success: true });
});

const confirmPassword = asyncHandler(async (req, res) => {
  const admin = await findVerifiedAdmin(req.admin.email, req.body.password);
  if (String(admin._id) !== String(req.admin._id)) throw new AppError("Password confirmation failed", 401);
  res.json({ success: true });
});

const savePushToken = asyncHandler(async (req, res) => {
  const token = String(req.body.token || "").trim();
  if (!isExpoPushToken(token)) throw new AppError("Invalid Expo push token", 400);

  const nativePushToken = String(req.body.nativePushToken || req.body.fcmToken || "").trim();
  const deviceId = String(req.body.deviceId || "").trim().slice(0, 120);
  const platform = String(req.body.platform || "android").trim().slice(0, 30);
  await Admin.updateOne(
    { _id: req.admin._id },
    {
      $pull: { pushTokens: { token } },
    },
  );
  await Admin.updateOne(
    { _id: req.admin._id },
    {
      $pull: { expoPushTokens: { token } },
    },
  );
  if (nativePushToken) {
    await Admin.updateOne(
      { _id: req.admin._id },
      {
        $pull: { fcmPushTokens: { token: nativePushToken } },
      },
    );
  }
  await Admin.updateOne(
    { _id: req.admin._id },
    {
      $push: {
        pushTokens: {
          $each: [{ token, deviceId, platform, active: true, lastSeenAt: new Date(), createdAt: new Date() }],
          $slice: -5,
        },
        expoPushTokens: {
          $each: [{ token, deviceId, platform, active: true, lastSeenAt: new Date(), createdAt: new Date() }],
          $slice: -5,
        },
        ...(nativePushToken ? {
          fcmPushTokens: {
            $each: [{ token: nativePushToken, deviceId, platform, active: true, lastSeenAt: new Date(), createdAt: new Date() }],
            $slice: -5,
          },
        } : {}),
      },
    },
  );

  const updatedAdmin = await Admin.findById(req.admin._id).select("expoPushTokens fcmPushTokens").lean();
  console.log("[push] Saved admin Expo push token:", {
    adminId: String(req.admin._id),
    token,
    nativePushTokenSaved: Boolean(nativePushToken),
    platform,
    deviceId,
    expoPushTokenCount: updatedAdmin?.expoPushTokens?.length || 0,
    fcmPushTokenCount: updatedAdmin?.fcmPushTokens?.length || 0,
  });

  res.json({
    success: true,
    expoPushTokenCount: updatedAdmin?.expoPushTokens?.length || 0,
    fcmPushTokenCount: updatedAdmin?.fcmPushTokens?.length || 0,
  });
});

const listNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(Math.max(1, Number(req.query.limit || 30)), 60);
  const filter = { targetAdmin: req.admin._id };
  if (req.query.type) {
    const type = String(req.query.type);
    filter.type = type === "admin_request" ? { $in: ["admin_request", "android_access_request"] } : type;
  }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .populate("relatedBooking")
      .populate("bookingId")
      .populate("discussionMessageId")
      .populate("requestedAdmin", "name email role tag adminAndroidAppAccess")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ targetAdmin: req.admin._id, isRead: false }),
  ]);

  res.json({
    success: true,
    data: {
      items,
      total,
      unreadCount,
      page,
      pages: Math.ceil(total / limit),
    },
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, targetAdmin: req.admin._id },
    { isRead: true, readAt: new Date() },
    { new: true },
  ).lean();
  if (!notification) throw new AppError("Notification not found", 404);
  const unreadCount = await Notification.countDocuments({ targetAdmin: req.admin._id, isRead: false });
  emitNotificationToAdmins([req.admin._id], "notification:read", { notificationId: String(notification._id), unreadCount });
  emitNotificationToAdmins([req.admin._id], "notification:unread-count", { unreadCount });
  res.json({ success: true, data: notification });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { targetAdmin: req.admin._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  emitNotificationToAdmins([req.admin._id], "notification:read-all", { unreadCount: 0 });
  emitNotificationToAdmins([req.admin._id], "notification:unread-count", { unreadCount: 0 });
  res.json({ success: true });
});

const requestGrantAccessOtp = asyncHandler(async (req, res) => {
  if (!isSuperAdminEmail(req.admin?.email)) {
    throw new AppError("Only main owner can grant Android app access", 403);
  }

  const notification = await Notification.findOne({
    _id: req.params.id,
    targetAdmin: req.admin._id,
    type: { $in: ["admin_request", "android_access_request"] },
    actionStatus: "pending",
  }).populate("requestedAdmin");

  if (!notification || !notification.requestedAdmin) {
    throw new AppError("Access request notification not found", 404);
  }

  const challenge = await createOtpChallenge({
    admin: req.admin,
    purpose: "mobile-grant",
    req,
    requesterSession: req.adminSession?._id,
    payload: {
      notificationId: notification._id,
      requestedAdmin: notification.requestedAdmin._id,
    },
  });

  res.status(202).json({
    success: true,
    requiresOtp: true,
    challengeId: challenge._id,
    expiresAt: challenge.expiresAt,
    email: maskEmail(req.admin.email),
    requestedAdminEmail: maskEmail(notification.requestedAdmin.email),
    message: "OTP sent to Main Admin email",
  });
});

const grantAndroidAccess = asyncHandler(async (req, res) => {
  if (!isSuperAdminEmail(req.admin?.email)) {
    throw new AppError("Only main owner can grant Android app access", 403);
  }

  const challenge = await verifyOtpChallenge({
    challengeId: req.body.challengeId,
    otp: req.body.otp,
    adminId: req.admin._id,
    purpose: "mobile-grant",
    requesterSession: req.adminSession?._id,
  });

  const notification = await Notification.findOne({
    _id: req.params.id,
    targetAdmin: req.admin._id,
    type: { $in: ["admin_request", "android_access_request"] },
  }).populate("requestedAdmin");

  if (!notification || !notification.requestedAdmin) {
    throw new AppError("Access request notification not found", 404);
  }

  if (String(challenge.payload?.notificationId || "") !== String(notification._id)) {
    throw new AppError("OTP does not match this access request", 400);
  }

  const requestedAdmin = await Admin.findByIdAndUpdate(
    notification.requestedAdmin._id,
    { adminAndroidAppAccess: true },
    { new: true },
  );
  if (!requestedAdmin) throw new AppError("Requested admin not found", 404);

  notification.isRead = true;
  notification.readAt = notification.readAt || new Date();
  notification.actionStatus = "granted";
  notification.resolvedAt = new Date();
  notification.metadata = {
    ...(notification.metadata || {}),
    grantedBy: req.admin.email,
    grantedAt: new Date(),
  };
  await notification.save();

  await notifyAndroidAccessGranted(requestedAdmin, req.admin).catch((error) => {
    console.error("Mobile grant success notification failed:", { error: error.message });
  });

  res.json({
    success: true,
    data: {
      notification,
      admin: publicAdmin(requestedAdmin),
    },
  });
});

module.exports = {
  grantAndroidAccess,
  confirmPassword,
  listNotifications,
  login,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
  me,
  requestAndroidAccess,
  requestGrantAccessOtp,
  resendLoginOtp,
  savePushToken,
  updateProfileImage,
  verifyLoginOtp,
};
