const Order = require("../models/Order");
const Settings = require("../models/WhatsAppAISettings");
const { graphRequest, sendTemplateMessage } = require("./whatsappCloudApiService");
const { recordMessage } = require("./whatsappConversationService");

const PREFIXES = ["https://rzp.io/rzp/", "https://rzp.io/i/"];

function validatePaymentTemplate(template) {
  if (!template || !["APPROVED", "ACTIVE"].includes(template.status) || template.category !== "UTILITY") throw new Error("Payment request template is not approved as Utility");
  const components = template.components || [];
  const buttons = components.filter((c) => c.type === "BUTTONS").flatMap((c) => c.buttons || []);
  const prefix = PREFIXES.find((p) => buttons[0]?.url === `${p}{{1}}`);
  const body = components.find((c) => c.type === "BODY")?.text || "";
  const variables = [...new Set(Array.from(body.matchAll(/\{\{([^}]+)\}\}/g), (m) => m[1]))].sort();
  if (components.some((c) => c.type === "HEADER") || buttons.length !== 1 || buttons[0]?.type !== "URL" || !prefix
    || JSON.stringify(variables) !== JSON.stringify(["1", "2", "3"])) {
    throw new Error("Payment template needs no header, body variables 1/2/3, and one dynamic Razorpay URL button");
  }
  return { name: template.name, language: template.language, prefix };
}

async function getPaymentTemplate({ account, settings }) {
  if (settings?.enhancedPaymentsEnabled !== true) throw new Error("Enhanced Payment Links must be activated for this WhatsApp account");
  if (!String(require("../config/env").razorpay.keyId || "").startsWith("rzp_live_")) throw new Error("Enhanced payment cards require live Razorpay payment links");
  const name = settings.paymentTemplateName || "pulse_order_payment";
  const language = settings.paymentTemplateLanguage || "en";
  const response = await graphRequest({
    phoneNumberId: account.businessAccountId, accessToken: account.accessToken,
    path: "message_templates", method: "GET", query: { name, fields: "name,status,language,category,components", limit: 100 },
  });
  return validatePaymentTemplate((response.data || []).find((t) => t.name === name && t.language === language));
}

function paymentTemplateComponents(order, template) {
  const url = new URL(order.paymentLinkUrl);
  const suffix = order.paymentLinkUrl.slice(template.prefix.length);
  if (!order.paymentLinkUrl.startsWith(template.prefix) || url.origin !== "https://rzp.io" || !/^[a-zA-Z0-9_-]+$/.test(suffix)) {
    throw new Error("Razorpay payment link does not match the approved template prefix");
  }
  return [
    { type: "body", parameters: [order.customer.name, order.orderId, Number(order.total).toFixed(2)].map((text) => ({ type: "text", text: String(text) })) },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: suffix }] },
  ];
}

async function sendPaymentRequest({ account, conversation, orderId }) {
  const order = await Order.findOne({ orderId, whatsappAccount: account._id, whatsappConversation: conversation._id });
  if (!order || order.orderStatus !== "awaiting_payment" || !["pending", "failed"].includes(order.paymentStatus)) return { skipped: true };
  if (order.paymentRequestMessageId) return { sent: true, reused: true };
  const settings = await Settings.findOne({ account: account._id }).lean();
  const template = await getPaymentTemplate({ account, settings });
  const components = paymentTemplateComponents(order, template);
  const claim = await Order.findOneAndUpdate({ _id: order._id, paymentRequestMessageId: "",
    orderStatus: "awaiting_payment", paymentStatus: { $in: ["pending", "failed"] },
    $or: [{ paymentRequestClaimUntil: null }, { paymentRequestClaimUntil: { $lt: new Date() } }],
  }, { $set: { paymentRequestClaimUntil: new Date(Date.now() + 60000) } }, { new: true });
  if (!claim) return { skipped: true };
  try {
    const result = await sendTemplateMessage({ phoneNumberId: account.phoneNumberId, accessToken: account.accessToken,
      to: conversation.customerWaId, templateName: template.name, languageCode: template.language, components });
    const waMessageId = result?.messages?.[0]?.id;
    if (!waMessageId) throw new Error("Payment template was not accepted by WhatsApp");
    await Order.updateOne({ _id: order._id }, { $set: { paymentRequestMessageId: waMessageId }, $unset: { paymentRequestClaimUntil: 1 } });
    await recordMessage({ accountId: account._id, conversationId: conversation._id, customerWaId: conversation.customerWaId,
      direction: "outbound", sender: "system", type: "interactive", waMessageId,
      text: `Payment request: ${order.orderId} — INR ${Number(order.total).toFixed(2)}. Tap Pay now on the payment card.`,
      meta: { kind: "payment_request", template: template.name, orderId: order.orderId },
    });
    return { sent: true };
  } catch (error) {
    await Order.updateOne({ _id: order._id, paymentRequestMessageId: "" }, { $unset: { paymentRequestClaimUntil: 1 } });
    throw error;
  }
}

module.exports = { getPaymentTemplate, validatePaymentTemplate, paymentTemplateComponents, sendPaymentRequest };
