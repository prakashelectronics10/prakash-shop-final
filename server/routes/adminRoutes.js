const express = require("express");
const {
  dashboard,
  listAdmins,
  requestCreateAdminOtp,
  resendCreateAdminOtp,
  createAdmin: createAdminAccount,
  updateAdmin,
  deleteAdmin: deleteAdminAccount,
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
} = require("../controllers/adminController");
const { deleteUploadedImage, upload, uploadImage, uploadImages } = require("../controllers/uploadController");
const {
  getWebSettings,
  uploadOgImage,
  deleteOgImage,
  uploadFavicon,
  deleteFavicon,
} = require("../controllers/webSettingController");
const { updateProfileImage } = require("../controllers/mobileController");
const {
  listNotificationEmails,
  createNotificationEmail,
  updateNotificationEmail,
  deleteNotificationEmail,
} = require("../controllers/notificationEmailController");
const { requirePermission, requireSuperAdmin } = require("../middleware/auth");
const {
  listAutoSliderBanners,
  createAutoSliderBanner,
  updateAutoSliderBanner,
  deleteAutoSliderBanner,
} = require("../controllers/autoSliderBannerController");
const { validateBody } = require("../middleware/validate");
const {
  categorySchema,
  productSchema,
  heroSchema,
  offerSchema,
  contactSchema,
  siteContentSchema,
  adminCreateSchema,
  adminCreateVerifySchema,
  otpResendSchema,
  adminUpdateSchema,
  notificationEmailCreateSchema,
  notificationEmailUpdateSchema,
} = require("../validations/adminSchemas");

const router = express.Router();

router.get("/dashboard", dashboard);

router.get("/admins", requireSuperAdmin, listAdmins);
router.post("/admins", requireSuperAdmin, validateBody(adminCreateSchema), requestCreateAdminOtp);
router.post("/admins/verify-create", requireSuperAdmin, validateBody(adminCreateVerifySchema), createAdminAccount);
router.post("/admins/resend-create-otp", requireSuperAdmin, validateBody(otpResendSchema), resendCreateAdminOtp);
router.put("/admins/:id", requireSuperAdmin, validateBody(adminUpdateSchema), updateAdmin);
router.delete("/admins/:id", requireSuperAdmin, deleteAdminAccount);

router.get("/notification-emails", requireSuperAdmin, listNotificationEmails);
router.post("/notification-emails", requireSuperAdmin, validateBody(notificationEmailCreateSchema), createNotificationEmail);
router.put("/notification-emails/:id", requireSuperAdmin, validateBody(notificationEmailUpdateSchema), updateNotificationEmail);
router.delete("/notification-emails/:id", requireSuperAdmin, deleteNotificationEmail);

router.get("/bookings", requirePermission("bookings"), listBookings);
router.get("/bookings/:id", requirePermission("bookings"), getBooking);
router.post("/bookings/:id/retry-email", requirePermission("bookings"), retryBookingEmail);
router.patch("/bookings/:id/repaired", requirePermission("bookings"), markBookingRepaired);
router.delete("/bookings/:id", requirePermission("bookings"), deleteBooking);

router.get("/products", requirePermission("services", "featuredRepairs"), listProducts);
router.post("/products", requirePermission("services", "featuredRepairs"), validateBody(productSchema), createProduct);
router.put("/products/:id", requirePermission("services", "featuredRepairs"), validateBody(productSchema), updateProduct);
router.delete("/products/:id", requirePermission("services", "featuredRepairs"), deleteProduct);

router.get("/categories", requirePermission("services", "featuredRepairs"), listCategories);
router.post("/categories", requirePermission("services", "featuredRepairs"), validateBody(categorySchema), createCategory);
router.put("/categories/:id", requirePermission("services", "featuredRepairs"), validateBody(categorySchema), updateCategory);
router.delete("/categories/:id", requirePermission("services", "featuredRepairs"), deleteCategory);

router.get("/hero", requirePermission("services", "featuredRepairs", "about", "footer"), getHero);
router.put("/hero", requirePermission("services", "featuredRepairs", "about", "footer"), validateBody(heroSchema), upsertHero);

router.get("/offers", requirePermission("offers"), listOffers);
router.post("/offers", requirePermission("offers"), validateBody(offerSchema), createOffer);
router.put("/offers/:id", requirePermission("offers"), validateBody(offerSchema), updateOffer);
router.delete("/offers/:id", requirePermission("offers"), deleteOffer);

router.get("/auto-slider-banners", requirePermission("autoSliderBanners", "shopProducts"), listAutoSliderBanners);
router.post("/auto-slider-banners", requirePermission("autoSliderBanners"), createAutoSliderBanner);
router.put("/auto-slider-banners/:id", requirePermission("autoSliderBanners"), updateAutoSliderBanner);
router.delete("/auto-slider-banners/:id", requirePermission("autoSliderBanners"), deleteAutoSliderBanner);

router.get("/contact", requirePermission("footer"), getContact);
router.put("/contact", requirePermission("footer"), validateBody(contactSchema), upsertContact);

router.get("/site-content", requirePermission("gallery", "testimonials", "about", "footer"), listContent);
router.get("/site-content/:key", requirePermission("gallery", "testimonials", "about", "footer"), getContent);
router.put("/site-content/:key", requirePermission("gallery", "testimonials", "about", "footer"), validateBody(siteContentSchema), upsertContent);

router.get("/web-settings", requirePermission("webSettings"), getWebSettings);
router.post("/web-settings/og-image", requirePermission("webSettings"), upload.single("image"), uploadOgImage);
router.delete("/web-settings/og-image", requirePermission("webSettings"), deleteOgImage);
router.post("/web-settings/favicon", requirePermission("webSettings"), upload.single("image"), uploadFavicon);
router.delete("/web-settings/favicon", requirePermission("webSettings"), deleteFavicon);

router.post("/profile-image", upload.single("image"), updateProfileImage);
router.post("/upload/image", requirePermission("offers", "services", "featuredRepairs", "gallery", "testimonials", "about", "footer", "projectParts", "projectSliders", "brandsSlider", "shopProducts", "autoSliderBanners", "webSettings", "invoices"), upload.single("image"), uploadImage);
router.post("/upload/images", requirePermission("offers", "services", "featuredRepairs", "gallery", "testimonials", "about", "footer", "projectParts", "projectSliders", "brandsSlider", "shopProducts", "autoSliderBanners", "webSettings", "invoices"), upload.array("images", 8), uploadImages);
router.delete("/upload/image", requirePermission("offers", "services", "featuredRepairs", "gallery", "testimonials", "about", "footer", "projectParts", "projectSliders", "brandsSlider", "shopProducts", "autoSliderBanners", "webSettings", "invoices"), deleteUploadedImage);

module.exports = router;
