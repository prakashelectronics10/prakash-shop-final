const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const AppError = require("../utils/AppError");
const Account = require("../models/WhatsAppAccount");
const Conversation = require("../models/WhatsAppConversation");
const Message = require("../models/WhatsAppMessage");
const Greeting = require("../models/WhatsAppGreetingLog");
const CustomerState = require("../models/WhatsAppCustomerState");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const customerKey = (phoneNumberId, customerWaId) => hash(`${phoneNumberId}:${String(customerWaId).replace(/^\+/, "")}`);

async function getCustomerState(phoneNumberId, customerWaId) {
  if (!phoneNumberId || !customerWaId || !mongoose.connection.readyState) return null;
  return CustomerState.findById(customerKey(phoneNumberId, customerWaId)).lean();
}

async function shouldIgnoreInbound({ phoneNumberId, customerWaId, timestamp, messageId }) {
  const state = await getCustomerState(phoneNumberId, customerWaId);
  return Boolean(state?.blockedAt || (state?.deletedThrough && (timestamp < state.deletedThrough
    || (messageId && state.lastDeletedMessageHashes?.includes(hash(messageId))))));
}

async function manageCustomer(conversationId, action) {
  if (!mongoose.isObjectIdOrHexString(conversationId)) throw new AppError("Invalid conversation ID", 400);
  return mongoose.connection.transaction(async (session) => {
    const conversation = await Conversation.findById(conversationId).session(session);
    if (!conversation || conversation.awaitingCustomerMessage) throw new AppError("Conversation not found", 404);
    const account = await Account.findById(conversation.account).select("phoneNumberId").session(session);
    if (!account) throw new AppError("WhatsApp account unavailable", 404);
    const key = customerKey(account.phoneNumberId, conversation.customerWaId);
    if (action === "delete") {
      // Meta timestamps have second precision. A fresh message can arrive in the same second.
      const deletedThrough = new Date(Math.floor(Date.now() / 1000) * 1000);
      const recentIds = await Message.distinct("waMessageId", {
        conversation: conversation._id, account: conversation.account, direction: "inbound", createdAt: { $gte: deletedThrough },
      }).session(session);
      await CustomerState.updateOne({ _id: key }, { $max: { deletedThrough },
        $set: { lastDeletedMessageHashes: recentIds.filter(Boolean).map(hash) }, $unset: { blockedAt: 1 },
      }, { upsert: true, session });
      await Message.deleteMany({ conversation: conversation._id, account: conversation.account }, { session });
      await Greeting.deleteOne({ account: conversation.account, customerWaId: conversation.customerWaId }, { session });
      await Conversation.deleteOne({ _id: conversation._id }, { session });
    } else {
      const blockedAt = action === "block" ? conversation.blockedAt || new Date() : null;
      await CustomerState.updateOne({ _id: key }, blockedAt ? { $set: { blockedAt } } : { $unset: { blockedAt: 1 } },
        { upsert: Boolean(blockedAt), session });
      conversation.blockedAt = blockedAt;
      await conversation.save({ session });
    }
    return conversation;
  });
}

module.exports = { getCustomerState, shouldIgnoreInbound, manageCustomer };
