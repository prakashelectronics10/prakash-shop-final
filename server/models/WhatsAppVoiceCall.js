const mongoose = require("mongoose");

const call = new mongoose.Schema({
  _id: String, // Meta call ID
  phoneNumberId: String,
  caller: String,
  phone: String,
  direction: { type: String, enum: ["inbound", "outbound"] },
  metaCallId: String,
  outboundAnswerClaimed: Boolean,
  roomName: String,
  state: { type: String, enum: ["incoming", "active", "completed", "missed", "failed"], required: true },
  slot: Number,
  deadline: Date,
  cleanupAfter: Date,
  cleanupAttempts: Number,
  cleanupFromMeta: Boolean,
  workerClaim: String,
  provider: String,
  model: String,
  voice: String,
  greeting: String,
  languages: [String],
  startedAt: Date,
  endedAt: Date,
  durationSeconds: Number,
  metaFinal: Boolean,
  errorCode: String,
  callback: { type: String, enum: ["requested", "resolved"] },
  callbackAt: Date,
  summaryTopic: { type: String, enum: ["catalog", "order", "repair", "payment", "general_support"] },
  summaryConsentAt: Date,
  usage: {
    inputText: Number, cachedText: Number, inputAudio: Number, cachedAudio: Number,
    outputText: Number, outputAudio: Number, unclassifiedTokens: Number,
  },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

call.index({ slot: 1 }, { unique: true, partialFilterExpression: { slot: { $exists: true } } });
call.index({ state: 1, deadline: 1 });
call.index({ cleanupAfter: 1 }, { sparse: true });
call.index({ roomName: 1 }, { unique: true, sparse: true });
call.index({ metaCallId: 1 }, { unique: true, sparse: true });
call.index({ createdAt: -1, _id: -1 });
call.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("WhatsAppVoiceCall", call);
