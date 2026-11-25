const Order = require("../models/Order");
let ready;

function ensureWhatsAppCheckoutIndexes() {
  if (!ready) {
    // Production disables Mongoose autoIndex. Do not rely on schema declarations
    // alone for the unique key that protects repeated checkout submissions.
    ready = Promise.all([
      Order.collection.createIndex({ checkoutKey: 1 }, { unique: true, sparse: true }),
      Order.collection.createIndex({ razorpayPaymentLinkId: 1 }),
    ]).catch((error) => { ready = null; throw error; });
  }
  return ready;
}

module.exports = { ensureWhatsAppCheckoutIndexes };
