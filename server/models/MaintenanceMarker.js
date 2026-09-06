const mongoose = require("mongoose");

const maintenanceMarkerSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MaintenanceMarker", maintenanceMarkerSchema);
