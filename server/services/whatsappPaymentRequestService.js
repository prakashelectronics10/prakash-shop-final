const Order = require("../models/Order");
const Settings = require("../models/WhatsAppAISettings");
const { logger } = require("../utils/logger");
const { graphRequest, sendInteractiveMessage, sendTemplateMessage } = require("./whatsappCloudApiService");
const { hasVoiceCustomerServiceWindow, recordMessage } = require("./whatsappConversationService");

const PREFIXES = ["https://rzp.io/rzp/", "https://rzp.io/i/"];
const RAZORPAY_SHORT_LINK = /^https:\/\/rzp\.io\/(?:rzp|i)\/[a-zA-Z0-9_-]+$/;

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

const ORDER_TEMPLATE = "order_details_with_product_list";
const ORDER_TEMPLATE_ID = "1468551722067479";
const env = require("../config/env");
const { toHttpsUrl } = require("./metaCatalogMapper");

function orderDetailsComponents(order, template) {
  if (!RAZORPAY_SHORT_LINK.test(order.paymentLinkUrl)) throw new Error("Invalid Razorpay payment link");
  const amount = (rupees) => ({ offset: 100, value: Math.round(rupees * 100) });
  const image = order.items.map((item) => toHttpsUrl(item.productImageUrl, env.productionUrl)).find(Boolean)
    || new URL("/logo512.png", env.productionUrl).href;
  const charges = order.additionalCharges || [];
  const shipping = charges.length
    ? charges.reduce((sum, charge) => sum + amount(charge.amount).value, 0)
    : amount(order.deliveryCharge || 0).value;
  const customer = order.customer;
  const details = {
    reference_id: order.orderId, type: "physical-goods", currency: "INR", payment_type: "upi",
    beneficiaries: [{ name: customer.name, address_line1: customer.address.slice(0, 100),
      address_line2: (customer.address.slice(100) || customer.landmark || "").slice(0, 100), postal_code: customer.pincode, country: "India" }],
    payment_settings: [{ type: "payment_link", payment_link: { uri: order.paymentLinkUrl } }],
    total_amount: amount(order.total),
    order: {
      status: "pending", catalog_id: env.metaCatalog.catalogId,
      items: order.items.map((item) => ({ retailer_id: item.retailerId,
        name: [item.productName, item.variantSummary].filter(Boolean).join(" - "),
        quantity: item.quantity, amount: amount(item.unitPrice) })),
      subtotal: amount(order.subtotal), discount: amount(order.discountTotal || 0),
      shipping: { offset: 100, value: shipping,
        ...(charges.length ? { description: charges.map((c) => c.name + " Rs " + c.amount).join(", ").slice(0, 120) } : {}) },
    },
  };
  const bodyParameter = template?.bodyParameter ?? "1";
  return [
    ...(template?.imageHeader !== false ? [{ type: "header", parameters: [{ type: "image", image: { link: image } }] }] : []),
    ...(bodyParameter ? [{ type: "body", parameters: [{ type: "text", text: customer.name,
      ...(bodyParameter === "1" ? {} : { parameter_name: bodyParameter }) }] }] : []),
    { type: "button", sub_type: "order_details", index: "0", parameters: [{ type: "action", action: { order_details: details } }] },
  ];
}

async function getPaymentTemplate({ account, settings, legacy = false }) {
  if (settings?.enhancedPaymentsEnabled !== true) throw new Error("Enhanced Payment Links must be activated for this WhatsApp account");
  if (!String(require("../config/env").razorpay.keyId || "").startsWith("rzp_live_")) throw new Error("Enhanced payment cards require live Razorpay payment links");
  if (!legacy) {
    const template = await graphRequest({ businessAccountId: ORDER_TEMPLATE_ID, path: "", method: "GET",
      accessToken: account.accessToken, query: { fields: "name,status,language,components" } });
    if (template.name !== ORDER_TEMPLATE || template.status !== "APPROVED"
      || !template.components?.some((c) => c.type === "BUTTONS" && c.buttons?.[0]?.type === "ORDER_DETAILS")) {
      throw new Error("Order details template unavailable");
    }
    const header = template.components.find((component) => component.type === "HEADER");
    const body = template.components.find((component) => component.type === "BODY");
    const variables = [...new Set(Array.from((body?.text || "").matchAll(/\{\{([^}]+)\}\}/g), (match) => match[1]))];
    if (!body || (header && header.format !== "IMAGE") || variables.length > 1
      || (variables.length && !["1", "name", "customer_name"].includes(variables[0]))) {
      throw new Error("Order details template has unsupported header or body parameters");
    }
    return { name: template.name, language: template.language, imageHeader: Boolean(header), bodyParameter: variables[0] || "" };
  }
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
  const recipient = { phoneNumberId: account.phoneNumberId, accessToken: account.accessToken, to: conversation.customerWaId };
  const isVoiceOrder = Boolean(order.whatsappVoiceCall);
  let send;
  let templateName;
  let text = `Payment request: ${order.orderId} — INR ${Number(order.total).toFixed(2)}.`;
  if (isVoiceOrder) {
    if (!order.whatsappVoiceMessaging || !/^\d{8,15}$/.test(recipient.to || "")) return { skipped: true };
    if (!await hasVoiceCustomerServiceWindow({ callId: order.whatsappVoiceCall, account,
      conversationId: conversation._id, customerWaId: recipient.to })) return { skipped: true };
    if (!RAZORPAY_SHORT_LINK.test(order.paymentLinkUrl)) throw new Error("Invalid Razorpay payment link");
    text += `\nTap Pay now to complete payment. Your order will be confirmed after payment is verified.\n\n${order.paymentLinkUrl}`;
    send = () => sendInteractiveMessage({ ...recipient, interactive: {
      type: "cta_url", body: { text },
      action: { name: "cta_url", parameters: { display_text: "Pay now", url: order.paymentLinkUrl } },
    } });
  } else {
    const settings = await Settings.findOne({ account: account._id }).lean();
    const template = await getPaymentTemplate({ account, settings, legacy: !order.items?.some((item) => item.retailerId) });
    const components = template.name === ORDER_TEMPLATE ? orderDetailsComponents(order, template) : paymentTemplateComponents(order, template);
    templateName = template.name;
    text += " Open the payment card to review your order.";
    send = () => sendTemplateMessage({ ...recipient, templateName, languageCode: template.language, components });
  }
  const claimUntil = new Date(Date.now() + 60000);
  const claim = await Order.findOneAndUpdate({ _id: order._id, paymentRequestMessageId: "",
    orderStatus: "awaiting_payment", paymentStatus: { $in: ["pending", "failed"] },
    $or: [{ paymentRequestClaimUntil: null }, { paymentRequestClaimUntil: { $lt: new Date() } }],
  }, { $set: { paymentRequestClaimUntil: claimUntil } }, { new: true });
  if (!claim) return { skipped: true };
  let waMessageId;
  try {
    waMessageId = (await send())?.messages?.[0]?.id;
    if (!waMessageId) throw new Error("Payment message was not accepted by WhatsApp");
  } catch (error) {
    await Order.updateOne({ _id: order._id, paymentRequestClaimUntil: claimUntil }, { $unset: { paymentRequestClaimUntil: 1 } });
    throw error;
  }
  await Order.updateOne({ _id: order._id, paymentRequestClaimUntil: claimUntil }, {
    $set: { paymentRequestMessageId: waMessageId, ...(isVoiceOrder && { paymentRequestFormat: "cta_url" }) },
    $unset: { paymentRequestClaimUntil: 1 },
  });
  await recordMessage({ accountId: account._id, conversationId: conversation._id, customerWaId: conversation.customerWaId,
    direction: "outbound", sender: "system", type: "interactive", waMessageId, text,
    meta: { kind: "payment_request", ...(templateName && { template: templateName }), orderId: order.orderId },
  }).catch(() => logger.warn("whatsapp.payment_request_history_failed", { orderId: order.orderId }));
  return { sent: true };
}

module.exports = { orderDetailsComponents, getPaymentTemplate, validatePaymentTemplate, paymentTemplateComponents, sendPaymentRequest };
