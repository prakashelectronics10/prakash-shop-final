const mongoose = require("mongoose");

const settings = new mongoose.Schema({
  _id: String,
  enabled: Boolean,
  model: String,
  voice: String,
  greeting: String,
  languages: [String],
  maxConcurrent: Number,
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model("WhatsAppVoiceSettings", settings);
