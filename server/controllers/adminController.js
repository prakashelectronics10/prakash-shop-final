const Analytics = require("../models/Analytics");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const Category = require("../models/Category");
const ContactInfo = require("../models/ContactInfo");
const HeroSection = require("../models/HeroSection");
const Invoice = require("../models/Invoice");
const Offer = require("../models/Offer");
const Product = require("../models/Product");
const ShopProduct = require("../models/ShopProduct");
const SiteContent = require("../models/SiteContent");
const NotificationEmail = require("../models/NotificationEmail");
const Notification = require("../models/Notification");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const slugify = require("../utils/slugify");
const { allPermissions, isSuperAdminEmail } = require("../middleware/auth");
const {
  createOtpChallenge,
  maskEmail,
  resendOtpChallenge,
  verifyAdminCreateChallenge,
} = require("../services/adminOtpService");
const { revokeAdminSessions } = require("../services/adminSessionService");
const { clearSitePayloadCache } = require("../services/siteService");
const { collectPublicIdsFromSources, deleteImagesStrict } = require("../services/cloudinaryService");
const {
  sendBookingAdminNotification,
  sendRepairCompletedNotification,
} = require("../services/bookingNotificationService");

const allowedContentKeys = new Set([
  "navbar",
  "servicesSection",
  "stats",
  "testimonials",
  "gallery",
  "about",
  "contactSection",
  "footer",
  "featuredCarousel",
]);

const contentPermissionByKey = {
  gallery: "gallery",
  testimonials: "testimonials",
  about: "about",
  footer: "footer",
};

function ensureContentPermission(req, key) {
  if (isSuperAdminEmail(req.admin?.email)) return;
  const permission = contentPermissionByKey[key];
  if (!permission) return;
  if (!new Set(req.admin?.permissions || []).has(permission)) {
    throw new AppError("You do not have permission for this content section", 403);
  }
}

function normalizeGoogleMapEmbed(value) {
  const raw = String(value || "").trim();
  const src = raw.match(/src=["']([^"']+)["']/i)?.[1] || raw;
  if (!src) return "";

  try {
    const url = new URL(src);
    const allowedHosts = new Set(["www.google.com", "google.com", "maps.google.com"]);
    if (!allowedHosts.has(url.hostname)) return "";
    url.protocol = "https:";
    if (!url.pathname.includes("/maps/embed")) {
      url.searchParams.set("output", "embed");
    }
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function contentImagePublicIds(key, value = {}) {
  if (key === "gallery") {
    return collectPublicIdsFromSources((value.items || []).map((item) => ({
      publicId: item.publicId,
      imagePublicId: item.imagePublicId,
      imageUrl: item.imageUrl || item.src,
      url: item.url,
    })));
  }

  if (key === "testimonials") {
    return collectPublicIdsFromSources((value.items || []).map((item) => ({
      publicId: item.publicId,
      imagePublicId: item.imagePublicId,
      imageUrl: item.imageUrl,
      url: item.photoUrl,
    })));
  }

  if (key === "about") {
    return collectPublicIdsFromSources((value.reasons || []).map((item) => ({
      publicId: item.publicId,
      imagePublicId: item.imagePublicId,
      imageUrl: item.imageUrl,
      url: item.url,
    })));
  }

  return [];
}

async function deleteCloudinaryImages(publicIds) {
  const ids = [...new Set((publicIds || []).filter(Boolean))];
  if (!ids.length) return;
  await deleteImagesStrict(ids);
}

const dashboard = asyncHandler(async (_req, res) => {
  const [
    analytics,
    products,
    shopProducts,
    featuredRepairs,
    categories,
    offers,
    bookings,
    pendingBookings,
    repairedBookings,
    admins,
    notificationEmails,
    unreadNotifications,
    contentDocs,
    invoices,
    pendingInvoices,
  ] = await Promise.all([
    Analytics.findOne({ key: "global" }).lean(),
    Product.countDocuments(),
    ShopProduct.countDocuments(),
    Product.countDocuments({ isFeatured: true }),
    Category.countDocuments(),
    Offer.countDocuments(),
    Booking.countDocuments(),
    Booking.countDocuments({ status: "pending" }),
    Booking.countDocuments({ status: "repaired" }),
    Admin.countDocuments({ isActive: true }),
    NotificationEmail.countDocuments({ isEnabled: true }),
    Notification.countDocuments({ isRead: false }),
    SiteContent.find({ key: { $in: ["about", "gallery", "testimonials"] } }).lean(),
    Invoice.countDocuments(),
    Invoice.countDocuments({ paymentStatus: { $ne: "paid" } }),
  ]);

  const content = contentDocs.reduce((acc, doc) => {
    acc[doc.key] = doc.value || {};
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      totalFormSubmissions: analytics?.totalFormSubmissions || 0,
      products,
      shopProducts,
      featuredRepairs,
      categories,
      offers,
      bookings,
      pendingBookings,
      repairedBookings,
      admins,
      notificationEmails,
      unreadNotifications,
      invoices,
      pendingInvoices,
      aboutCards: content.about?.reasons?.length || 0,
      galleryImages: content.gallery?.items?.length || 0,
      testimonials: content.testimonials?.items?.length || 0,
    },
  });
});

const listAdmins = asyncHandler(async (_req, res) => {
  const admins = await Admin.find({})
    .select("_id name email role tag permissions adminAndroidAppAccess lastMobileLogin mobileAccessRequestedAt isActive lastLoginAt createdAt")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: admins.map((admin) => ({
      ...admin,
      tag: isSuperAdminEmail(admin.email) ? "main owner" : admin.tag || "admin",
      permissions: isSuperAdminEmail(admin.email) ? allPermissions : admin.permissions || [],
      adminAndroidAppAccess: isSuperAdminEmail(admin.email) ? true : Boolean(admin.adminAndroidAppAccess),
      lastMobileLogin: admin.lastMobileLogin || null,
      mobileAccessRequestedAt: admin.mobileAccessRequestedAt || null,
      isSuperAdmin: isSuperAdminEmail(admin.email),
    })),
  });
});

const requestCreateAdminOtp = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const exists = await Admin.exists({ email });
  if (exists) {
    throw new AppError("Admin email already exists", 409);
  }

  const passwordHash = await Admin.hashPassword(req.body.password);
  const challenge = await createOtpChallenge({
    admin: req.admin,
    purpose: "admin-create",
    req,
    requesterSession: req.adminSession?._id,
    secondaryEmail: email,
    payload: {
      name: req.body.name,
      email,
      role: req.body.role || "admin",
      passwordHash,
      tag: req.body.tag || "employee",
      permissions: req.body.permissions || [],
      adminAndroidAppAccess: Boolean(req.body.adminAndroidAppAccess),
    },
  });

  res.status(202).json({
    success: true,
    requiresOtp: true,
    challengeId: challenge._id,
    expiresAt: challenge.expiresAt,
    email: maskEmail(req.admin.email),
    ownerEmail: maskEmail(req.admin.email),
    newAdminEmail: maskEmail(email),
    message: "OTP sent to main admin email and new admin email before creating the new admin",
  });
});

const resendCreateAdminOtp = asyncHandler(async (req, res) => {
  const challenge = await resendOtpChallenge({
    challengeId: req.body.challengeId,
    purpose: "admin-create",
    adminId: req.admin._id,
    requesterSession: req.adminSession?._id,
  });

  res.json({
    success: true,
    challengeId: challenge._id,
    expiresAt: challenge.expiresAt,
    email: maskEmail(req.admin.email),
    ownerEmail: maskEmail(req.admin.email),
    newAdminEmail: maskEmail(challenge.secondaryEmail),
    message: "OTP resent to main admin email and new admin email",
  });
});

const createAdmin = asyncHandler(async (req, res) => {
  const challenge = await verifyAdminCreateChallenge({
    challengeId: req.body.challengeId,
    ownerOtp: req.body.ownerOtp,
    newAdminOtp: req.body.newAdminOtp,
    adminId: req.admin._id,
    requesterSession: req.adminSession?._id,
  });

  const payload = challenge.payload || {};
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || !payload.passwordHash) {
    throw new AppError("Invalid admin creation request", 400);
  }
  const exists = await Admin.exists({ email });
  if (exists) {
    throw new AppError("Admin email already exists", 409);
  }

  const admin = await Admin.create({
    name: payload.name || "",
    email,
    passwordHash: payload.passwordHash,
    role: payload.role || "admin",
    tag: payload.tag || "employee",
    permissions: payload.permissions || [],
    adminAndroidAppAccess: Boolean(payload.adminAndroidAppAccess),
    isActive: true,
  });

  await NotificationEmail.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        label: payload.name || email,
        isEnabled: true,
        source: "adminAccount",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => undefined);

  res.status(201).json({
    success: true,
    data: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      tag: admin.tag,
      permissions: admin.permissions,
      adminAndroidAppAccess: admin.adminAndroidAppAccess,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    },
  });
});

const updateAdmin = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.params.id).select("+passwordHash");
  if (!admin) throw new AppError("Admin not found", 404);
  if (isSuperAdminEmail(admin.email)) {
    throw new AppError("Main owner account cannot be edited here", 400);
  }

  const shouldRevokeSessions = req.body.isActive === false || Boolean(req.body.password);
  if (req.body.name !== undefined) admin.name = req.body.name;
  if (req.body.role !== undefined) admin.role = req.body.role;
  if (req.body.tag !== undefined) admin.tag = req.body.tag;
  if (req.body.permissions !== undefined) admin.permissions = req.body.permissions;
  if (req.body.adminAndroidAppAccess !== undefined) admin.adminAndroidAppAccess = Boolean(req.body.adminAndroidAppAccess);
  if (req.body.isActive !== undefined) admin.isActive = req.body.isActive;
  if (req.body.password) admin.passwordHash = await Admin.hashPassword(req.body.password);

  await admin.save();
  if (shouldRevokeSessions) {
    await revokeAdminSessions(admin._id, req.body.isActive === false ? "admin-disabled" : "password-reset");
  }

  res.json({
    success: true,
    data: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      tag: admin.tag,
      permissions: admin.permissions,
      adminAndroidAppAccess: admin.adminAndroidAppAccess,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    },
  });
});

const deleteAdmin = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) throw new AppError("Admin not found", 404);
  if (isSuperAdminEmail(admin.email)) {
    throw new AppError("Main owner account cannot be deleted", 400);
  }
  await revokeAdminSessions(admin._id, "admin-deleted");
  await NotificationEmail.updateOne(
    { email: admin.email, source: "adminAccount" },
    { $set: { isEnabled: false } },
  ).catch(() => undefined);
  await admin.deleteOne();
  res.json({ success: true });
});

const listProducts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 100), 100);
  const filter = {};

  if (req.query.search) filter.title = { $regex: req.query.search, $options: "i" };
  if (req.query.category) filter.category = req.query.category;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name slug")
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } });
});

const createProduct = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    slug: req.body.slug || slugify(req.body.title),
    category: req.body.category || null,
  };
  const product = await Product.create(payload);
  clearSitePayloadCache();
  res.status(201).json({ success: true, data: product });
});

const updateProduct = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    slug: req.body.slug || slugify(req.body.title),
    category: req.body.category || null,
  };
  const product = await Product.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
  if (!product) throw new AppError("Product not found", 404);
  clearSitePayloadCache();
  res.json({ success: true, data: product });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError("Product not found", 404);

  await deleteCloudinaryImages(
    collectPublicIdsFromSources(product.imagePublicId, product.imageUrl, product.gallery),
  );

  await product.deleteOne();
  clearSitePayloadCache();
  res.json({ success: true });
});

const listCategories = asyncHandler(async (_req, res) => {
  const items = await Category.find({}).sort({ displayOrder: 1, name: 1 });
  res.json({ success: true, data: items });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create({
    ...req.body,
    slug: req.body.slug || slugify(req.body.name),
  });
  clearSitePayloadCache();
  res.status(201).json({ success: true, data: category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { ...req.body, slug: req.body.slug || slugify(req.body.name) },
    { new: true, runValidators: true },
  );
  if (!category) throw new AppError("Category not found", 404);
  clearSitePayloadCache();
  res.json({ success: true, data: category });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw new AppError("Category not found", 404);
  clearSitePayloadCache();
  res.json({ success: true });
});

const getHero = asyncHandler(async (_req, res) => {
  const hero = await HeroSection.findOne().sort({ updatedAt: -1 });
  res.json({ success: true, data: hero });
});

const upsertHero = asyncHandler(async (req, res) => {
  const existing = await HeroSection.findOne().sort({ updatedAt: -1 });
  const hero = existing
    ? await HeroSection.findByIdAndUpdate(existing._id, req.body, { new: true, runValidators: true })
    : await HeroSection.create(req.body);
  clearSitePayloadCache();
  res.json({ success: true, data: hero });
});

const listOffers = asyncHandler(async (_req, res) => {
  const items = await Offer.find({}).sort({ displayOrder: 1, createdAt: -1 });
  res.json({ success: true, data: items });
});

const createOffer = asyncHandler(async (req, res) => {
  const offer = await Offer.create(req.body);
  clearSitePayloadCache();
  res.status(201).json({ success: true, data: offer });
});

const updateOffer = asyncHandler(async (req, res) => {
  const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!offer) throw new AppError("Offer not found", 404);
  clearSitePayloadCache();
  res.json({ success: true, data: offer });
});

const deleteOffer = asyncHandler(async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) throw new AppError("Offer not found", 404);

  await deleteCloudinaryImages(
    collectPublicIdsFromSources(offer.imagePublicId, offer.imageUrl),
  );

  await offer.deleteOne();
  clearSitePayloadCache();
  res.json({ success: true });
});

const getContact = asyncHandler(async (_req, res) => {
  const contact = await ContactInfo.findOne().sort({ updatedAt: -1 });
  res.json({ success: true, data: contact });
});

const upsertContact = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    googleMapEmbedUrl: normalizeGoogleMapEmbed(req.body.googleMapEmbedUrl),
    streetViewEmbedUrl: normalizeGoogleMapEmbed(req.body.streetViewEmbedUrl),
  };
  const existing = await ContactInfo.findOne().sort({ updatedAt: -1 });
  const contact = existing
    ? await ContactInfo.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true })
    : await ContactInfo.create(payload);
  clearSitePayloadCache();
  res.json({ success: true, data: contact });
});

const listContent = asyncHandler(async (_req, res) => {
  const docs = await SiteContent.find({}).sort({ key: 1 });
  res.json({ success: true, data: docs });
});

const getContent = asyncHandler(async (req, res) => {
  ensureContentPermission(req, req.params.key);
  const doc = await SiteContent.findOne({ key: req.params.key });
  if (!doc) throw new AppError("Content section not found", 404);
  res.json({ success: true, data: doc });
});

const upsertContent = asyncHandler(async (req, res) => {
  const { key } = req.params;
  ensureContentPermission(req, key);
  if (!allowedContentKeys.has(key)) {
    throw new AppError("This content key is not editable", 400);
  }

  const existingDoc = await SiteContent.findOne({ key });
  const nextValue = req.body.value || {};
  const nextIds = new Set(contentImagePublicIds(key, nextValue));
  const removedPublicIds = contentImagePublicIds(key, existingDoc?.value || {}).filter((publicId) => !nextIds.has(publicId));

  await deleteCloudinaryImages(removedPublicIds);

  const doc = await SiteContent.findOneAndUpdate(
    { key },
    { key, value: nextValue },
    { new: true, upsert: true, runValidators: true },
  );
  clearSitePayloadCache();
  res.json({ success: true, data: doc });
});

const listBookings = asyncHandler(async (_req, res) => {
  const items = await Booking.find({}).sort({ requestedAt: -1, createdAt: -1 }).lean();
  res.json({ success: true, data: items });
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).lean();
  if (!booking) throw new AppError("Booking not found", 404);
  res.json({ success: true, data: booking });
});

const retryBookingEmail = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new AppError("Booking not found", 404);
  await sendBookingAdminNotification(booking);
  res.json({ success: true, data: booking });
});

const markBookingRepaired = asyncHandler(async (req, res) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status: "repaired" },
    { new: true, runValidators: true },
  );
  if (!booking) throw new AppError("Booking not found", 404);
  await sendRepairCompletedNotification(booking).catch((error) => {
    console.error("Repair completion notification failed:", {
      bookingId: String(booking._id),
      error: error.message,
    });
  });
  res.json({ success: true, data: booking });
});

const deleteBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new AppError("Booking not found", 404);

  await deleteCloudinaryImages(
    collectPublicIdsFromSources(booking.imagePublicId, booking.imageUrl, booking.images),
  );

  await booking.deleteOne();
  res.json({ success: true });
});

module.exports = {
  dashboard,
  listAdmins,
  requestCreateAdminOtp,
  resendCreateAdminOtp,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getHero,
  upsertHero,
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  getContact,
  upsertContact,
  listContent,
  getContent,
  upsertContent,
  listBookings,
  getBooking,
  retryBookingEmail,
  markBookingRepaired,
  deleteBooking,
};
