const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const PulseAIInstruction = require("../models/PulseAIInstruction");
const PulseAIUnavailableDemand = require("../models/PulseAIUnavailableDemand");
const PulseAIUnavailableDemandSettings = require("../models/PulseAIUnavailableDemandSettings");

async function loadUnavailableDemandSettings() {
  return PulseAIUnavailableDemandSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default", minimumUniqueCustomers: 7, trackingPeriodHours: 168 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

const listPulseAIInstructions = asyncHandler(async (_req, res) => {
  const items = await PulseAIInstruction.find({})
    .sort({ isActive: -1, priority: -1, updatedAt: -1 })
    .lean();
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: items });
});

const createPulseAIInstruction = asyncHandler(async (req, res) => {
  const item = await PulseAIInstruction.create({
    ...req.body,
    createdBy: req.admin?._id || null,
    updatedBy: req.admin?._id || null,
  });
  res.status(201).json({ success: true, data: item });
});

const updatePulseAIInstruction = asyncHandler(async (req, res) => {
  const item = await PulseAIInstruction.findByIdAndUpdate(
    req.params.id,
    { ...req.body, updatedBy: req.admin?._id || null },
    { new: true, runValidators: true },
  );
  if (!item) throw new AppError("Pulse AI instruction not found", 404);
  res.json({ success: true, data: item });
});

const deletePulseAIInstruction = asyncHandler(async (req, res) => {
  const item = await PulseAIInstruction.findByIdAndDelete(req.params.id);
  if (!item) throw new AppError("Pulse AI instruction not found", 404);
  res.json({ success: true });
});

const getPulseAIUnavailableDemandSettings = asyncHandler(async (_req, res) => {
  const settings = await loadUnavailableDemandSettings();
  const cutoff = new Date(Date.now() - settings.trackingPeriodHours * 60 * 60 * 1000);
  const trackedDemands = await PulseAIUnavailableDemand.countDocuments({ latestDetectedAt: { $gte: cutoff } });
  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    data: {
      minimumUniqueCustomers: settings.minimumUniqueCustomers,
      trackingPeriodHours: settings.trackingPeriodHours,
      trackedDemands,
      updatedAt: settings.updatedAt,
    },
  });
});

const updatePulseAIUnavailableDemandSettings = asyncHandler(async (req, res) => {
  const settings = await PulseAIUnavailableDemandSettings.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        minimumUniqueCustomers: req.body.minimumUniqueCustomers,
        trackingPeriodHours: req.body.trackingPeriodHours,
        updatedBy: req.admin?._id || null,
      },
      $setOnInsert: { key: "default" },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, data: settings });
});

module.exports = {
  listPulseAIInstructions,
  createPulseAIInstruction,
  updatePulseAIInstruction,
  deletePulseAIInstruction,
  getPulseAIUnavailableDemandSettings,
  updatePulseAIUnavailableDemandSettings,
};
