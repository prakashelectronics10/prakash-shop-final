const mongoose = require("mongoose");
const env = require("./env");
const { logger } = require("../utils/logger");
const { ensureAdminSessionIndexes, revokeAllAdminSessionsOnce } = require("../services/adminSessionService");

function isConnected() {
  return mongoose.connection.readyState === 1;
}

async function connectDB() {
  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is missing. Add your MongoDB Atlas URI in server/.env.");
  }

  mongoose.set("strictQuery", true);
  mongoose.set("autoIndex", env.nodeEnv !== "production");
  mongoose.set("bufferCommands", false);
  await mongoose.connect(env.mongoUri, {
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
    minPoolSize: 0,
    maxPoolSize: 10,
    maxIdleTimeMS: 30000,
  });

  logger.info("mongodb.connected", { host: mongoose.connection.host });
  await ensureAdminSessionIndexes();
  logger.info("mongodb.admin_session_indexes_ready");
  await require("../services/whatsappCheckoutIndexes").ensureWhatsAppCheckoutIndexes();
  logger.info("mongodb.whatsapp_checkout_indexes_ready");
  await require("../services/orderInvoiceService").ensureOrderInvoiceIndexes();
  logger.info("mongodb.order_invoice_indexes_ready");
  await require("../models/Order").collection.createIndex({ invoiceWhatsAppNextAttemptAt: 1 }, { sparse: true });
  await require("../models/InvoiceSetting").collection.createIndex({ key: 1 }, { unique: true });
  const cleanup = await revokeAllAdminSessionsOnce();
  if (!cleanup.skipped) {
    logger.info("mongodb.admin_sessions_revoked_once", { modifiedCount: cleanup.modifiedCount });
  }
}

mongoose.connection.on("disconnected", () => {
  logger.warn("mongodb.disconnected");
});

mongoose.connection.on("error", (error) => {
  logger.error("mongodb.error", { error: error.message });
});

module.exports = connectDB;
module.exports.isConnected = isConnected;
