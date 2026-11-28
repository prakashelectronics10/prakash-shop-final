const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: String,
  blockedAt: Date,
  deletedThrough: Date,
  lastDeletedMessageHashes: { type: [String], default: undefined },
}, { versionKey: false });

module.exports = mongoose.model("WhatsAppCustomerState", schema);
