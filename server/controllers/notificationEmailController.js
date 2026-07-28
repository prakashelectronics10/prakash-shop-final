const mongoose = require("mongoose");
const NotificationEmail = require("../models/NotificationEmail");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Notification email not found", 404);
  }
}

const listNotificationEmails = asyncHandler(async (_req, res) => {
  const items = await NotificationEmail.find({})
    .sort({ isEnabled: -1, email: 1 })
    .lean();

  res.json({ success: true, data: items });
});

const createNotificationEmail = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const exists = await NotificationEmail.exists({ email });
  if (exists) {
    throw new AppError("This email is already in the notification list", 409);
  }

  const item = await NotificationEmail.create({
    email,
    label: req.body.label || "",
    isEnabled: req.body.isEnabled !== false,
    source: "manual",
  });

  res.status(201).json({ success: true, data: item });
});

const updateNotificationEmail = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const payload = {
    label: req.body.label || "",
    isEnabled: req.body.isEnabled !== false,
  };

  if (req.body.email) {
    const email = normalizeEmail(req.body.email);
    const exists = await NotificationEmail.exists({ email, _id: { $ne: req.params.id } });
    if (exists) {
      throw new AppError("This email is already in the notification list", 409);
    }
    payload.email = email;
  }

  const item = await NotificationEmail.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new AppError("Notification email not found", 404);

  res.json({ success: true, data: item });
});

const deleteNotificationEmail = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const item = await NotificationEmail.findByIdAndDelete(req.params.id);
  if (!item) throw new AppError("Notification email not found", 404);
  res.json({ success: true });
});

module.exports = {
  listNotificationEmails,
  createNotificationEmail,
  updateNotificationEmail,
  deleteNotificationEmail,
};
