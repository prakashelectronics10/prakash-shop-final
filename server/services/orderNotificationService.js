const Order = require("../models/Order");
const { getAdminNotificationRecipients } = require("./bookingNotificationService");
const { enqueueEmail, isEmailConfigured } = require("./email");
const { renderOrderAdminEmail } = require("./email/templates/orderTemplate");
const { notifyOrderCreated } = require("./mobileNotificationService");
const {
  sendPaymentReceivedWhatsApp,
  sendOrderConfirmationWhatsApp,
} = require("./whatsappTransactionalService");
const { logger } = require("../utils/logger");

async function claimOrderNotification(orderId) {
  return Order.findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: "paid",
      $or: [{ notifiedAt: null }, { notifiedAt: { $exists: false } }],
    },
    { $set: { notifiedAt: new Date() } },
    { new: true },
  );
}

async function sendOrderAdminEmails(order) {
  if (!isEmailConfigured()) {
    return { delivered: false, reason: "email_not_configured" };
  }

  const recipients = await getAdminNotificationRecipients();
  if (!recipients.length) {
    return { delivered: false, reason: "no_recipients" };
  }

  const template = renderOrderAdminEmail(order);
  recipients.forEach((recipient) => {
    enqueueEmail({
      to: recipient,
      subject: template.subject,
      text: template.text,
      html: template.html,
      tags: [
        { name: "type", value: "order_notification" },
        { name: "order", value: String(order.orderId || "").slice(0, 48) },
      ],
    }, {
      idempotencyKey: `order-paid-${order.orderId}-${recipient}`,
    });
  });

  return { delivered: true, recipients: recipients.length };
}

async function notifyOrderPaid(orderOrId) {
  const orderId = orderOrId?._id || orderOrId;
  if (!orderId) return { queued: false };

  const order = await claimOrderNotification(orderId);
  if (!order) {
    return { queued: false, skipped: true };
  }

  try {
    await sendOrderAdminEmails(order);
  } catch (error) {
    console.error("Order admin email notification failed:", {
      orderId: order.orderId,
      error: error.message,
    });
  }

  try {
    await notifyOrderCreated(order);
  } catch (error) {
    console.error("Order mobile push notification failed:", {
      orderId: order.orderId,
      error: error.message,
    });
  }

  try {
    await sendPaymentReceivedWhatsApp({ order });
  } catch (error) {
    logger.error("Order WhatsApp payment_received failed", {
      orderId: order.orderId,
      error: error.message,
    });
  }

  try {
    await sendOrderConfirmationWhatsApp({ order });
  } catch (error) {
    logger.error("Order WhatsApp confirmation failed", {
      orderId: order.orderId,
      error: error.message,
    });
  }

  return { queued: true, orderId: order.orderId };
}

function enqueueOrderPaidNotification(orderOrId) {
  const orderId = String(orderOrId?._id || orderOrId || "");
  if (!orderId) return { queued: false };

  setImmediate(() => {
    notifyOrderPaid(orderOrId).catch((error) => {
      console.error("Order paid notification failed:", {
        orderId,
        error: error.message,
      });
    });
  });

  return { queued: true };
}

module.exports = {
  enqueueOrderPaidNotification,
  notifyOrderPaid,
};
