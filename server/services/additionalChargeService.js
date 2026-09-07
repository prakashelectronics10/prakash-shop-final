const AdditionalCharge = require("../models/AdditionalCharge");

const DELIVERY_CHARGE_SLUG = "delivery-charge";

async function ensureDeliveryCharge() {
  let charge = await AdditionalCharge.findOne({ slug: DELIVERY_CHARGE_SLUG });
  if (!charge) {
    try {
      return await AdditionalCharge.create({
        name: "Delivery charge",
        slug: DELIVERY_CHARGE_SLUG,
        amount: null,
        isActive: true,
        isSystem: true,
        sortOrder: -100,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      charge = await AdditionalCharge.findOne({ slug: DELIVERY_CHARGE_SLUG });
    }
  }
  if (!charge) return null;
  if (charge.name !== "Delivery charge" || !charge.isActive || !charge.isSystem || charge.sortOrder !== -100) {
    charge.name = "Delivery charge";
    charge.isActive = true;
    charge.isSystem = true;
    charge.sortOrder = -100;
    await charge.save();
  }
  return charge;
}

function serializeCharge(charge) {
  const value = charge?.toObject ? charge.toObject() : charge;
  return {
    _id: value?._id,
    name: value?.name || "Additional charge",
    slug: value?.slug || "",
    amount: Number.isFinite(value?.amount) ? value.amount : null,
    isActive: value?.isActive !== false,
    isSystem: Boolean(value?.isSystem),
    sortOrder: Number(value?.sortOrder || 0),
    createdAt: value?.createdAt,
    updatedAt: value?.updatedAt,
  };
}

async function listCharges({ activeOnly = false } = {}) {
  await ensureDeliveryCharge();
  const filter = activeOnly ? { isActive: true } : {};
  const charges = await AdditionalCharge.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
  return charges.map(serializeCharge);
}

async function getOrderChargeSnapshots() {
  const charges = await listCharges({ activeOnly: true });
  return charges.map((charge) => ({
    chargeId: charge._id,
    name: charge.name,
    slug: charge.slug,
    amount: Number.isFinite(charge.amount) ? Number(charge.amount.toFixed(2)) : 0,
  }));
}

module.exports = {
  DELIVERY_CHARGE_SLUG,
  ensureDeliveryCharge,
  serializeCharge,
  listCharges,
  getOrderChargeSnapshots,
};
