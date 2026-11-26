const AdditionalCharge = require("../models/AdditionalCharge");

const DELIVERY_CHARGE_SLUG = "delivery-charge";
const PLATFORM_FEE_SLUG = "platform-fee";
const DEFAULT_PLATFORM_FEE_RATE = 3;
const deliveryCharge = {
  name: "Delivery charge",
  slug: DELIVERY_CHARGE_SLUG,
  sortOrder: -100,
};
const platformFee = {
  name: "Platform fee",
  slug: PLATFORM_FEE_SLUG,
  sortOrder: -99,
};

async function ensureSystemCharge({ slug, name, sortOrder }) {
  let charge = await AdditionalCharge.findOne({ slug });
  if (!charge) {
    try {
      return await AdditionalCharge.create({
        name,
        slug,
        isActive: true,
        isSystem: true,
        sortOrder,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      charge = await AdditionalCharge.findOne({ slug });
    }
  }
  if (!charge) return null;
  if (charge.name !== name || !charge.isActive || !charge.isSystem || charge.sortOrder !== sortOrder) {
    charge.name = name;
    charge.isActive = true;
    charge.isSystem = true;
    charge.sortOrder = sortOrder;
    await charge.save();
  }
  return charge;
}

function ensureDeliveryCharge() {
  return ensureSystemCharge(deliveryCharge);
}

function serializeCharge(charge) {
  const value = charge?.toObject ? charge.toObject() : charge;
  return {
    _id: value?._id,
    name: value?.name || "Additional charge",
    slug: value?.slug || "",
    amount: Number.isFinite(value?.amount) ? value.amount : null,
    ...(value?.slug === PLATFORM_FEE_SLUG
      ? { amount: null, ratePercent: value.ratePercent ?? DEFAULT_PLATFORM_FEE_RATE }
      : {}),
    isActive: value?.isActive !== false,
    isSystem: Boolean(value?.isSystem),
    sortOrder: Number(value?.sortOrder || 0),
    createdAt: value?.createdAt,
    updatedAt: value?.updatedAt,
  };
}

async function listCharges({ activeOnly = false } = {}) {
  await Promise.all([ensureDeliveryCharge(), ensureSystemCharge(platformFee)]);
  const filter = activeOnly ? { isActive: true } : {};
  const charges = await AdditionalCharge.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
  return charges.map(serializeCharge);
}

async function getOrderChargeSnapshots(productSubtotal) {
  const charges = await listCharges({ activeOnly: true });
  return charges.map((charge) => ({
    chargeId: charge._id,
    name: charge.name,
    slug: charge.slug,
    amount: charge.slug === PLATFORM_FEE_SLUG
      ? Math.round(Math.round(productSubtotal * 100) * Math.round(charge.ratePercent * 100) / 10000) / 100
      : Number((charge.amount || 0).toFixed(2)),
  }));
}

module.exports = {
  DELIVERY_CHARGE_SLUG,
  PLATFORM_FEE_SLUG,
  ensureDeliveryCharge,
  serializeCharge,
  listCharges,
  getOrderChargeSnapshots,
};
