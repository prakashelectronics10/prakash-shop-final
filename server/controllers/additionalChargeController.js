const AdditionalCharge = require("../models/AdditionalCharge");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const slugify = require("../utils/slugify");
const {
  DELIVERY_CHARGE_SLUG,
  PLATFORM_FEE_SLUG,
  listCharges,
  serializeCharge,
} = require("../services/additionalChargeService");

function cleanName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) throw new AppError("Charge name is required", 400);
  if (name.length > 80) throw new AppError("Charge name must be 80 characters or fewer", 400);
  return name;
}

function cleanAmount(value) {
  if (value === "" || value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
    throw new AppError("Charge must be a valid amount between 0 and 10,00,000", 400);
  }
  return Number(amount.toFixed(2));
}

function duplicateChargeError(error) {
  if (error?.code === 11000) return new AppError("A charge with this name already exists", 409);
  return error;
}

function cleanRatePercent(value) {
  if ((typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && !value.trim())) {
    throw new AppError("Enter a platform fee percentage between 0 and 100", 400);
  }
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new AppError("Enter a platform fee percentage between 0 and 100", 400);
  }
  return Number(rate.toFixed(2));
}

exports.getPublicCharges = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: await listCharges({ activeOnly: true }) });
});

exports.listAdminCharges = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: await listCharges() });
});

exports.createCharge = asyncHandler(async (req, res) => {
  const name = cleanName(req.body.name);
  const slug = slugify(name);
  if (!slug || [DELIVERY_CHARGE_SLUG, PLATFORM_FEE_SLUG].includes(slug)) {
    throw new AppError("Choose a different charge name", 400);
  }
  let charge;
  try {
    charge = await AdditionalCharge.create({
      name,
      slug,
      amount: cleanAmount(req.body.amount),
      isActive: req.body.isActive !== false,
    });
  } catch (error) {
    throw duplicateChargeError(error);
  }
  res.status(201).json({ success: true, data: serializeCharge(charge) });
});

exports.updateCharge = asyncHandler(async (req, res) => {
  const charge = await AdditionalCharge.findById(req.params.id);
  if (!charge) throw new AppError("Additional charge not found", 404);

  if (charge.slug === PLATFORM_FEE_SLUG) {
    charge.ratePercent = cleanRatePercent(req.body.ratePercent);
  } else if (charge.isSystem || charge.slug === DELIVERY_CHARGE_SLUG) {
    charge.amount = cleanAmount(req.body.amount);
  } else {
    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      charge.name = cleanName(req.body.name);
      const slug = slugify(charge.name);
      if (!slug || [DELIVERY_CHARGE_SLUG, PLATFORM_FEE_SLUG].includes(slug)) {
        throw new AppError("Choose a different charge name", 400);
      }
      charge.slug = slug;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "amount")) charge.amount = cleanAmount(req.body.amount);
    if (Object.prototype.hasOwnProperty.call(req.body, "isActive")) charge.isActive = Boolean(req.body.isActive);
  }

  try {
    await charge.save();
  } catch (error) {
    throw duplicateChargeError(error);
  }
  res.json({ success: true, data: serializeCharge(charge) });
});

exports.deleteCharge = asyncHandler(async (req, res) => {
  const charge = await AdditionalCharge.findById(req.params.id);
  if (!charge) throw new AppError("Additional charge not found", 404);
  if (charge.isSystem || [DELIVERY_CHARGE_SLUG, PLATFORM_FEE_SLUG].includes(charge.slug)) {
    throw new AppError("This charge is required and cannot be deleted", 400);
  }
  await charge.deleteOne();
  res.json({ success: true });
});
