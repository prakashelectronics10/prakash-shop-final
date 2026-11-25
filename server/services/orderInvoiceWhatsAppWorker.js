const env = require("../config/env");
const Order = require("../models/Order");
const { logger } = require("../utils/logger");
const { createOrderInvoice } = require("./orderInvoiceService");
const { sendOrderInvoiceWhatsApp } = require("./whatsappTransactionalService");

const POLL_MS = 30000;
const REVIEW_RETRY_MS = 5 * 60 * 1000;
const FAILURE_RETRY_MS = 15 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const BATCH_SIZE = 10;
let timer;
let running = false;

async function deliverNextOrderInvoice(now = new Date()) {
  const claimUntil = new Date(now.getTime() + LEASE_MS);
  const order = await Order.findOneAndUpdate(
    {
      paymentStatus: "paid",
      invoiceWhatsAppSentAt: null,
      invoiceWhatsAppNextAttemptAt: { $lte: now },
      $or: [
        { invoiceWhatsAppClaimUntil: null },
        { invoiceWhatsAppClaimUntil: { $lte: now } },
      ],
    },
    { $set: { invoiceWhatsAppClaimUntil: claimUntil } },
    { new: true, sort: { invoiceWhatsAppNextAttemptAt: 1 }, timestamps: false },
  );
  if (!order) return false;

  let result;
  try {
    const invoice = await createOrderInvoice(order);
    result = await sendOrderInvoiceWhatsApp({ order, invoice });
  } catch (error) {
    logger.warn("order.whatsapp_invoice_retry", {
      orderId: order.orderId, status: error.status, metaCode: error.payload?.error?.code,
      detail: error.message,
    });
  }

  const update = { $unset: { invoiceWhatsAppClaimUntil: 1 } };
  if (result?.ok || result?.reason === "whatsapp_number_missing") {
    update.$unset.invoiceWhatsAppNextAttemptAt = 1;
    if (result.ok) {
      update.$set = { invoiceWhatsAppSentAt: new Date(), invoiceWhatsAppMessageId: result.messageId };
    }
  } else {
    const delay = result?.reason === "template_unavailable" ? REVIEW_RETRY_MS : FAILURE_RETRY_MS;
    update.$set = { invoiceWhatsAppNextAttemptAt: new Date(Date.now() + delay) };
    if (result?.templateStatus) {
      logger.info("order.whatsapp_invoice_waiting_for_template", { orderId: order.orderId, status: result.templateStatus });
    }
  }
  await Order.updateOne({ _id: order._id, invoiceWhatsAppClaimUntil: claimUntil }, update, { timestamps: false });
  return true;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    for (let count = 0; count < BATCH_SIZE; count += 1) {
      if (!(await deliverNextOrderInvoice())) break;
    }
  } catch (error) {
    logger.error("order.whatsapp_invoice_worker_failed", { detail: error.message });
  } finally {
    running = false;
  }
}

function startOrderInvoiceWhatsAppWorker() {
  if (timer || !env.whatsapp.enabled) return;
  timer = setInterval(tick, POLL_MS);
  timer.unref();
  void tick();
}

module.exports = { deliverNextOrderInvoice, startOrderInvoiceWhatsAppWorker };
