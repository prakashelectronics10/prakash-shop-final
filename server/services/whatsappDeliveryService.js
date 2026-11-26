const WhatsAppDeliveryReceipt = require("../models/WhatsAppDeliveryReceipt");

const STATUS_RANK = new Map([["sent", 1], ["failed", 2], ["delivered", 3], ["read", 4]]);

function deliveryReceiptId(phoneNumberId, messageId) {
  return `${phoneNumberId}:${messageId}`;
}

async function recordDeliveryReceipts(payload) {
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (change.field !== "messages" || !phoneNumberId) continue;
      for (const event of change.value?.statuses || []) {
        const rank = STATUS_RANK.get(event.status);
        if (typeof event.id !== "string" || !event.id || !rank) continue;
        const _id = deliveryReceiptId(phoneNumberId, event.id);
        const filter = { _id, rank: { $lt: rank } };
        const detail = { status: event.status, rank, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
        if (event.status === "failed" && Number.isInteger(event.errors?.[0]?.code)) detail.errorCode = event.errors[0].code;
        const update = { $set: detail, ...(detail.errorCode === undefined ? { $unset: { errorCode: 1 } } : {}) };
        try {
          await WhatsAppDeliveryReceipt.updateOne(filter, update, { upsert: true });
        } catch (error) {
          if (error.code !== 11000) throw error;
          await WhatsAppDeliveryReceipt.updateOne(filter, update);
        }
      }
    }
  }
}

module.exports = { deliveryReceiptId, recordDeliveryReceipts };
