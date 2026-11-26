const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: String,
  status: { type: String, required: true },
  rank: { type: Number, required: true },
  errorCode: Number,
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

module.exports = mongoose.model("WhatsAppDeliveryReceipt", schema);
