const Product = require("../models/Product");
const ProjectPart = require("../models/ProjectPart");
const ShopProduct = require("../models/ShopProduct");
const Booking = require("../models/Booking");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const mongoose = require("mongoose");
const { uploadBuffer } = require("../services/cloudinaryService");
const { availableStockQuantity } = require("../utils/inventory");
const { getSitePayload, incrementFormSubmission } = require("../services/siteService");
const { enqueueBookingNotification, getAdminNotificationRecipients } = require("../services/bookingNotificationService");
const { enqueueEmail, isEmailConfigured } = require("../services/email");
const { renderContactAdminEmail } = require("../services/email/templates/contactTemplate");
const { validateEmailDeliverability } = require("../utils/validateEmail");

const SCIENCE_PROJECTS_CATEGORY = "Science Projects and Parts";

const productListProjection = [
  "title",
  "slug",
  "shortDescription",
  "description",
  "price",
  "originalPrice",
  "category",
  "categoryName",
  "iconName",
  "badge",
  "highlights",
  "imageUrl",
  "isActive",
  "isFeatured",
  "displayOrder",
  "createdAt",
].join(" ");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeQuantity(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(99, Math.max(1, parsed));
}

function parseBookingProducts(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .slice(0, 50)
    .map((item) => ({
      productId: safeString(item.productId || item._id || item.id || item.sourceId, 120),
      productSlug: safeString(item.productSlug || item.slug, 160),
      productName: safeString(item.productName || item.name, 180),
      productCategory: safeString(item.productCategory || item.category, 160),
      originalCategory: safeString(item.originalCategory, 160),
      productImageUrl: safeString(item.productImageUrl || item.imageUrl, 1000),
      productDescription: safeString(item.productDescription || item.shortDescription || item.description, 900),
      price: safePrice(item.price),
      quantity: safeQuantity(item.quantity),
      sourceType: safeString(item.sourceType || item.sourceCollection, 80),
      sourceId: safeString(item.sourceId || item.productId || item._id || item.id, 120),
    }))
    .filter((item) => item.productName);
}

function summarizeProducts(products) {
  if (!products.length) return {};
  const first = products[0];
  const names = products.map((item) => `${item.productName}${item.quantity > 1 ? ` x${item.quantity}` : ""}`);
  const categories = [...new Set(products.map((item) => item.productCategory).filter(Boolean))];
  return {
    productId: first.productId || first.sourceId || "",
    productSlug: first.productSlug || "",
    productName: products.length === 1 ? first.productName : `${products.length} products: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "..." : ""}`,
    productCategory: products.length === 1 ? first.productCategory : categories.slice(0, 3).join(", ") || "Multiple products",
    productImageUrl: first.productImageUrl || "",
    repairType: products.length === 1 ? first.productName : `Multiple products: ${names.join(", ")}`,
  };
}

function bookingProductSource(item = {}) {
  const type = String(item.sourceType || "").toLowerCase();
  if (type.includes("project")) return "project-part";
  if (type.includes("shop")) return "shop-product";
  if (item.productCategory === SCIENCE_PROJECTS_CATEGORY) return "project-part";
  return "";
}

function lookupClauses(item = {}) {
  const clauses = [];
  const ids = [item.sourceId, item.productId].map((value) => String(value || "").trim()).filter(Boolean);
  ids.forEach((id) => {
    if (mongoose.Types.ObjectId.isValid(id)) clauses.push({ _id: id });
  });
  const slug = String(item.productSlug || "").trim();
  if (slug) clauses.push({ slug });
  return clauses;
}

async function findBookingCatalogProduct(item) {
  const clauses = lookupClauses(item);
  if (!clauses.length) return null;

  const source = bookingProductSource(item);
  if (source === "project-part") {
    const product = await ProjectPart.findOne({ $or: clauses, isActive: true }).lean();
    return product ? { product, stockField: "stock" } : null;
  }
  if (source === "shop-product") {
    const product = await ShopProduct.findOne({ $or: clauses, isActive: true }).lean();
    return product ? { product, stockField: "quantity" } : null;
  }

  const [shopProduct, projectPart] = await Promise.all([
    ShopProduct.findOne({ $or: clauses, isActive: true }).lean(),
    ProjectPart.findOne({ $or: clauses, isActive: true }).lean(),
  ]);
  if (shopProduct) return { product: shopProduct, stockField: "quantity" };
  if (projectPart) return { product: projectPart, stockField: "stock" };
  return null;
}

async function validateBookingStock(products) {
  if (!products.length) return;

  for (const item of products) {
    const match = await findBookingCatalogProduct(item);
    if (!match) {
      throw new AppError(`${item.productName || "Product"} is no longer available. Please refresh the cart and try again.`, 409);
    }

    const availableQuantity = availableStockQuantity(match.product, match.stockField);
    if (availableQuantity < 1) {
      throw new AppError(`${item.productName || match.product.name || "Product"} is out of stock.`, 409);
    }
    if (item.quantity > availableQuantity) {
      throw new AppError(`${item.productName || match.product.name || "Product"} has only ${availableQuantity} item${availableQuantity > 1 ? "s" : ""} available.`, 409);
    }
  }
}

const getSite = asyncHandler(async (_req, res) => {
  const data = await getSitePayload();
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ success: true, data });
});

const getProducts = asyncHandler(async (req, res) => {
  const page = positiveInt(req.query.page, 1);
  const limit = Math.min(positiveInt(req.query.limit, 24), 100);
  const filter = { isActive: true };

  if (req.query.category) filter.categoryName = req.query.category;
  if (req.query.search) filter.title = { $regex: escapeRegex(req.query.search), $options: "i" };

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select(productListProjection)
      .populate("category", "name slug")
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .maxTimeMS(5000)
      .lean(),
    Product.countDocuments(filter),
  ]);

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ success: true, data: { items, total, page, pages: Math.ceil(total / limit) } });
});

const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate("category", "name slug")
    .lean();
  if (!product) throw new AppError("Product not found", 404);
  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
  res.json({ success: true, data: product });
});

const trackFormSubmit = asyncHandler(async (_req, res) => {
  const total = await incrementFormSubmission();
  res.status(201).json({ success: true, totalFormSubmissions: total });
});

const createContactMessage = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const message = String(req.body.message || "").trim();
  const reviewRating = Number(req.body.reviewRating || 0);

  if (!name || !phone) throw new AppError("Name and phone are required", 400);
  if (email) {
    const emailCheck = await validateEmailDeliverability(email);
    if (!emailCheck.valid) throw new AppError(emailCheck.reason || "Invalid email address", 400);
  }
  if (reviewRating && (reviewRating < 1 || reviewRating > 5)) {
    throw new AppError("Review rating must be between 1 and 5", 400);
  }

  const total = await incrementFormSubmission().catch(() => null);
  let emailQueued = false;

  if (isEmailConfigured()) {
    const recipients = await getAdminNotificationRecipients();
    if (recipients.length) {
      const template = renderContactAdminEmail({ name, phone, email, message, reviewRating });
      recipients.forEach((recipient) => {
        enqueueEmail({
          to: recipient,
          subject: template.subject,
          text: template.text,
          html: template.html,
          replyTo: email || undefined,
          tags: [{ name: "type", value: "contact_form" }],
        }, {
          idempotencyKey: `contact-${Date.now()}-${recipient}`,
        });
      });
      emailQueued = true;
    }
  }

  res.status(202).json({
    success: true,
    emailQueued,
    totalFormSubmissions: total,
  });
});

const validateBookingEmail = asyncHandler(async (req, res) => {
  const email = String(req.body.email || req.query.email || "").trim().toLowerCase();
  const result = await validateEmailDeliverability(email);
  if (!result.valid) {
    res.status(400).json({
      success: false,
      valid: false,
      message: result.reason || "Invalid email address",
    });
    return;
  }

  res.json({
    success: true,
    valid: true,
    message: result.reason || "Email address verified",
    email: result.email,
  });
});

const createBooking = asyncHandler(async (req, res) => {
  const bookingProducts = parseBookingProducts(req.body.products || req.body.cartProducts);
  const productSummary = summarizeProducts(bookingProducts);
  if (!req.body.repairType && productSummary.repairType) {
    req.body.repairType = productSummary.repairType;
  }

  const requiredFields = ["fullName", "customerEmail", "phoneNumber", "whatsappNumber", "address", "repairType"];
  const missing = requiredFields.find((field) => !String(req.body[field] || "").trim());
  if (missing) throw new AppError(`${missing} is required`, 400);
  const customerEmail = String(req.body.customerEmail || "").trim().toLowerCase();
  const emailCheck = await validateEmailDeliverability(customerEmail);
  if (!emailCheck.valid) throw new AppError(emailCheck.reason || "Invalid email address", 400);

  const phoneNumber = String(req.body.phoneNumber || "").replace(/\D/g, "");
  const whatsappNumber = String(req.body.whatsappNumber || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(phoneNumber)) throw new AppError("Phone number must be exactly 10 digits", 400);
  if (!/^\d{10}$/.test(whatsappNumber)) throw new AppError("WhatsApp number must be exactly 10 digits", 400);

  await validateBookingStock(bookingProducts);

  let images = [];
  let singleImage = {};
  const productImageUrl = String(req.body.productImageUrl || productSummary.productImageUrl || "").trim();

  // Handle multiple images (new functionality)
  if (req.files && req.files.length > 0) {
    if (req.files.length > 8) {
      throw new AppError("Maximum 8 images allowed per booking", 400);
    }

    try {
      const uploadPromises = req.files.map(async (file) => {
        const uploaded = await uploadBuffer(file.buffer);
        return {
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          uploadedAt: new Date()
        };
      });

      images = await Promise.all(uploadPromises);
    } catch (uploadError) {
      throw new AppError(`Failed to upload images: ${uploadError.message}`, 400);
    }
  }

  if (productImageUrl && !bookingProducts.length) {
    images.unshift({
      url: productImageUrl,
      publicId: String(req.body.productImagePublicId || ""),
      source: "product",
      uploadedAt: new Date(),
    });
  }

  // Handle single image (backward compatibility)
  if (req.file) {
    try {
      const uploaded = await uploadBuffer(req.file.buffer);
      singleImage = { imageUrl: uploaded.secure_url, imagePublicId: uploaded.public_id };
    } catch (uploadError) {
      throw new AppError(`Failed to upload image: ${uploadError.message}`, 400);
    }
  }

  const booking = await Booking.create({
    fullName: req.body.fullName,
    customerEmail: emailCheck.email || customerEmail,
    phoneNumber,
    whatsappNumber,
    address: req.body.address,
    repairType: req.body.repairType,
    message: req.body.message || "",
    productId: req.body.productId || productSummary.productId || "",
    productSlug: req.body.productSlug || productSummary.productSlug || "",
    productName: req.body.productName || productSummary.productName || "",
    productCategory: req.body.productCategory || productSummary.productCategory || "",
    productImageUrl,
    products: bookingProducts,
    bookingSource: req.body.bookingSource || (bookingProducts.length > 1 ? "cart" : productImageUrl ? "product-detail" : "manual"),
    requestedAt: new Date(),
    images: images.length > 0 ? images : [],
    ...singleImage,
  });

  await incrementFormSubmission().catch(() => undefined);
  enqueueBookingNotification(booking._id);
  res.status(201).json({ success: true, data: booking });
});

module.exports = {
  createBooking,
  createContactMessage,
  getProductBySlug,
  getProducts,
  getSite,
  trackFormSubmit,
  validateBookingEmail,
};
