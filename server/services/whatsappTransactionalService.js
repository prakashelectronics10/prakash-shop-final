const env = require("../config/env");
const { logger } = require("../utils/logger");
const {
  sendTextMessage,
  sendInteractiveMessage,
  sendTemplateMessage,
  getMessageTemplateStatus,
  hasWhatsAppBillingBlock,
  uploadPdfMedia,
} = require("./whatsappCloudApiService");
const { getOrderInvoicePdf } = require("./orderInvoiceService");
const { recordMessage, upsertConversation } = require("./whatsappConversationService");
const { formatCopyCodeMessage } = require("./whatsappFormatService");
const greetingService = require("./whatsappGreetingService");
const {
  getActiveWhatsAppAccount,
  toWhatsAppE164,
  toLocalTenDigit,
} = require("./whatsappAccountService");

const GREETING_SUPPRESS_MS = 48 * 60 * 60 * 1000;

function siteBaseUrl() {
  return String(env.frontendUrl || env.productionUrl || "https://prakashshop.in").replace(/\/$/, "");
}

function trackOrderUrl(orderId) {
  return `${siteBaseUrl()}/orders?id=${encodeURIComponent(String(orderId || "").trim())}`;
}

async function withAccount(order) {
  const account = order?.whatsappAccount
    ? (env.whatsapp.enabled ? await require("../models/WhatsAppAccount").findOne({ _id: order.whatsappAccount, isActive: true }) : null)
    : await getActiveWhatsAppAccount();
  if (!account) {
    logger.warn("whatsapp.transactional.no_account");
    return null;
  }
  return account;
}

async function prepareConversation(account, whatsappNumber, customerName = "") {
  const customerWaId = toWhatsAppE164(whatsappNumber);
  const conversation = await upsertConversation({
    accountId: account._id,
    customerWaId,
    customerName,
    direction: "outbound",
    preview: "Transactional update",
  });
  conversation.suppressGreetingUntil = new Date(Date.now() + GREETING_SUPPRESS_MS);
  if (customerName && !conversation.customerName) {
    conversation.customerName = customerName;
  }
  await conversation.save();
  return { conversation, customerWaId };
}

async function recordOutbound({
  account,
  conversation,
  customerWaId,
  type,
  text,
  buttons = [],
  waMessageId = "",
  meta = {},
}) {
  return recordMessage({
    accountId: account._id,
    conversationId: conversation._id,
    customerWaId,
    direction: "outbound",
    sender: "system",
    type,
    text,
    buttons,
    waMessageId,
    meta: { transactional: true, skipGreeting: true, ...meta },
  });
}

async function greetBeforeOrderUpdate({ account, conversation, customerWaId, order }) {
  try {
    const greeting = await greetingService.sendGreetingForAccount({
      account, conversationId: conversation._id, customerWaId, order,
      onOutbound: (item) => recordMessage({
        accountId: account._id, conversationId: conversation._id, customerWaId,
        direction: "outbound", sender: "system", type: item.type,
        text: item.text || "", mediaUrl: item.mediaUrl || "", buttons: item.buttons || [],
        waMessageId: item.result.messages[0].id, meta: { greeting: true },
      }),
    });
    if (greeting.sent) {
      conversation.greetingSentAt = new Date();
      await conversation.save();
    }
  } catch (error) {
    // A missing or rejected greeting must never discard a customer's order update.
    logger.warn("whatsapp.order_greeting_failed", { status: error.status, metaCode: error.payload?.error?.code });
  }
}

async function tryTemplateThenFallback({
  account,
  customerWaId,
  templateName,
  languageCode,
  components,
  fallback,
}) {
  if (templateName) {
    try {
      const result = await sendTemplateMessage({
        phoneNumberId: account.phoneNumberId,
        accessToken: account.accessToken,
        to: customerWaId,
        templateName,
        languageCode,
        components,
      });
      return { result, usedTemplate: true };
    } catch (error) {
      if (!fallback) return { result: null, usedTemplate: false };
      logger.warn("whatsapp.template_failed_fallback", {
        templateName,
        status: error.status,
        metaCode: error.payload?.error?.code,
      });
    }
  }
  if (!fallback) return { result: null, usedTemplate: false };
  const result = await fallback();
  return { result, usedTemplate: false };
}

function formatInrAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "Rs. 0";
  return `Rs. ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatPaymentDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

/** Send the approved WhatsApp Authentication template for a website verification. */
async function sendOtpWhatsApp({ whatsappNumber, otp, customerName = "" }) {
  const account = await withAccount();
  if (!account) {
    const error = new Error("WhatsApp is not configured. OTP cannot be sent.");
    error.status = 503;
    throw error;
  }
  if (await hasWhatsAppBillingBlock(account)) {
    throw Object.assign(new Error("Meta WhatsApp billing blocks business-initiated messages."), { status: 503, code: 141006 });
  }

  const customerWaId = toWhatsAppE164(whatsappNumber);
  const otpText = String(otp);
  const templates = env.whatsapp.templates;
  const result = await sendTemplateMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: customerWaId,
    templateName: templates.otp,
    languageCode: templates.otpLanguage,
    components: [
      { type: "body", parameters: [{ type: "text", text: otpText }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otpText }] },
    ],
  });
  const messageId = result?.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp did not acknowledge the verification code");

  // The code can arrive before the admin inbox entry is written.
  void prepareConversation(account, whatsappNumber, customerName)
    .then(({ conversation }) => recordOutbound({
      account, conversation, customerWaId, type: "text",
      text: "OTP requested for verification", waMessageId: messageId, meta: { kind: "otp" },
    }))
    .catch((error) => logger.warn("customer_whatsapp_otp.history_failed", { code: error.code }));

  return { phoneNumberId: account.phoneNumberId, messageId };
}
async function sendBookingConfirmationWhatsApp({ booking, senderAccount, templateOnly = false }) {
  const account = senderAccount || await withAccount();
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const whatsappNumber = booking.whatsappNumber || booking.phoneNumber;
  const bookingId = String(booking._id || "");
  const { conversation, customerWaId } = await prepareConversation(
    account,
    whatsappNumber,
    booking.fullName || "",
  );

  conversation.lastCopyCodes = {
    ...(conversation.lastCopyCodes || {}),
    bookingId,
  };
  await conversation.save();

  const customerName = String(booking.fullName || "").trim();
  const bodyText = [
    `Namaste${customerName ? ` ${customerName}` : ""},`,
    "Prakash Electronics mein aapki booking request receive ho gayi hai.",
    "",
    `*Booking ID:* ${bookingId}`,
    "",
    "Hamari team service details confirm karne ke liye jald aapse sampark karegi.",
    "Is message ko apne records ke liye sambhal kar rakhein.",
  ].join("\n");

  const templates = env.whatsapp.templates || {};
  const { result, usedTemplate } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: templates.bookingConfirm,
    languageCode: templates.bookingConfirmLanguage || "en",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: bookingId }],
      },
    ],
    fallback: templateOnly ? null : async () => {
      try {
        return await sendInteractiveMessage({
          phoneNumberId: account.phoneNumberId,
          accessToken: account.accessToken,
          to: customerWaId,
          interactive: {
            type: "button",
            body: { text: bodyText.slice(0, 1024) },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: { id: `copy:${bookingId}`, title: "Copy Booking ID" },
                },
              ],
            },
          },
        });
      } catch (_error) {
        return sendTextMessage({
          phoneNumberId: account.phoneNumberId,
          accessToken: account.accessToken,
          to: customerWaId,
          text: `${bodyText}\n\n${formatCopyCodeMessage(bookingId, "Booking ID")}`,
        });
      }
    },
  });

  if (templateOnly && !result?.messages?.[0]?.id) return { ok: false, reason: "template_unavailable" };
  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: usedTemplate ? "text" : "interactive",
    text: bodyText,
    buttons: usedTemplate ? [] : [{ type: "copy_code", label: "Copy Booking ID", code: bookingId }],
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "booking_confirmation", bookingId, templateSent: usedTemplate },
  });

  return { ok: true };
}

async function sendOrderConfirmationWhatsApp({ order }) {
  if (order.whatsappVoiceCall && !order.whatsappVoiceMessaging) return { ok: false, reason: "messaging_not_requested" };
  const account = await withAccount(order);
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const whatsappNumber = order.customer?.whatsappNumber || order.customer?.phone;
  const orderId = String(order.orderId || "");
  const trackUrl = trackOrderUrl(orderId);
  const { conversation, customerWaId } = await prepareConversation(
    account,
    whatsappNumber,
    order.customer?.name || "",
  );
  await greetBeforeOrderUpdate({ account, conversation, customerWaId, order });

  conversation.lastCopyCodes = {
    ...(conversation.lastCopyCodes || {}),
    orderId,
  };
  await conversation.save();

  const customerName = String(order.customer?.name || "").trim();
  const bodyText = [
    `Namaste${customerName ? ` ${customerName}` : ""},`,
    order.paymentMethod === "cod"
      ? `Prakash Electronics mein aapka Cash on Delivery order confirm ho gaya hai. Delivery par ${formatInrAmount(order.total)} pay karein.`
      : "Prakash Electronics mein aapka order confirm ho gaya hai aur payment receive ho gayi hai.",
    "",
    `*Order ID:* ${orderId}`,
    "",
    "Order ki status aur delivery updates ke liye neeche diye gaye link par jaayein.",
    "Dhanyavaad, Prakash Electronics.",
  ].join("\n");

  const templates = env.whatsapp.templates || {};
  // Template URL is https://prakashelectronics.in/orders?id={{1}} → button param is Order ID only.
  const maySendFreeForm = await voiceOrderMaySendFreeForm(order);
  const { result, usedTemplate } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: order.paymentMethod === "cod" ? "" : templates.orderConfirm,
    languageCode: templates.orderConfirmLanguage || "en",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: orderId }],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: orderId }],
      },
    ],
    fallback: maySendFreeForm ? async () => {
      try {
        return await sendInteractiveMessage({
          phoneNumberId: account.phoneNumberId,
          accessToken: account.accessToken,
          to: customerWaId,
          interactive: {
            type: "cta_url",
            body: { text: bodyText.slice(0, 1024) },
            action: {
              name: "cta_url",
              parameters: { display_text: "Track Order", url: trackUrl },
            },
          },
        });
      } catch (_error) {
        return sendTextMessage({
          phoneNumberId: account.phoneNumberId,
          accessToken: account.accessToken,
          to: customerWaId,
          text: `${bodyText}\n\n${formatCopyCodeMessage(orderId, "Order ID")}\n\nTrack Order: ${trackUrl}`,
        });
      }
    } : null,
  });

  if (!result) return { ok: false, reason: "template_unavailable" };
  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: usedTemplate ? "text" : "interactive",
    text: bodyText,
    buttons: [{ type: "url", label: "Track Order", url: trackUrl }],
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "order_confirmation", orderId, templateSent: usedTemplate },
  });

  return { ok: true };
}

async function voiceOrderMaySendFreeForm(order) {
  if (!order.whatsappVoiceCall) return true;
  const Message = require("../models/WhatsAppMessage");
  return Boolean(await Message.exists({
    conversation: order.whatsappConversation, direction: "inbound",
    "meta.isWelcomeRequest": { $ne: true }, createdAt: { $gt: new Date(Date.now() - 24 * 3600_000) },
  }));
}

async function sendPaidOrderCardStatus(order) {
  const account = await withAccount(order);
  const customerWaId = toWhatsAppE164(order.customer?.whatsappNumber);
  if (!account || !/^\d{8,15}$/.test(customerWaId)) return false;
  const status = order.orderStatus === "delivered" ? "completed"
    : ["shipped", "out_for_delivery"].includes(order.orderStatus) ? "shipped" : "processing";
  const result = await sendInteractiveMessage({
    phoneNumberId: account.phoneNumberId, accessToken: account.accessToken, to: customerWaId,
    interactive: {
      type: "order_status",
      body: { text: `Payment verified for order ${order.orderId}.` },
      action: { name: "review_order", parameters: {
        reference_id: order.orderId,
        order: { status, description: "Payment received." },
      } },
    },
  });
  return Boolean(result?.messages?.[0]?.id);
}

async function sendOrderInvoiceWhatsApp({ order, invoice }) {
  if (!invoice?._id) return { ok: false, reason: "invoice_not_available" };
  const whatsappNumber = toWhatsAppE164(order.customer?.whatsappNumber);
  if (!/^\d{8,15}$/.test(whatsappNumber)) return { ok: false, reason: "whatsapp_number_missing" };
  const account = await withAccount(order);
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const { orderInvoice: templateName, orderInvoiceLanguage: languageCode } = env.whatsapp.templates;
  const status = await getMessageTemplateStatus({
    businessAccountId: account.businessAccountId, accessToken: account.accessToken, templateName, languageCode,
  }).catch((error) => {
    // Some sender tokens can send approved templates but cannot read the management endpoint.
    if (error.status === 403 || [10, 200].includes(error.payload?.error?.code)) return null;
    throw error;
  });
  if (status && status !== "APPROVED") return { ok: false, reason: "template_unavailable", templateStatus: status };

  const { conversation, customerWaId } = await prepareConversation(
    account,
    whatsappNumber,
    order.customer?.name || "",
  );
  const filename = `${invoice.invoiceNumber}.pdf`;
  const pdf = await getOrderInvoicePdf(invoice);
  const credentials = { phoneNumberId: account.phoneNumberId, accessToken: account.accessToken };
  const mediaId = await uploadPdfMedia({ ...credentials, pdf, filename });
  const caption = `Namaste${order.customer?.name ? ` ${order.customer.name}` : ""}, aapke order ${order.orderId} ka paid invoice attached hai. Dhanyavaad, Prakash Electronics.`;
  const result = await sendTemplateMessage({
    ...credentials,
    to: customerWaId,
    templateName,
    languageCode,
    components: [
      { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename } }] },
      {
        type: "body",
        parameters: [
          { type: "text", text: String(order.customer?.name || "Customer").trim().replace(/\s+/g, " ") || "Customer" },
          { type: "text", text: order.orderId },
        ],
      },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: encodeURIComponent(order.orderId) }] },
    ],
  });
  const messageId = result?.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp did not accept the invoice message");
  try {
    await recordOutbound({
      account,
      conversation,
      customerWaId,
      type: "document",
      text: caption,
      waMessageId: messageId,
      meta: { kind: "order_invoice", orderId: order.orderId, invoiceNumber: invoice.invoiceNumber, mediaId },
    });
  } catch (error) {
    logger.warn("order.whatsapp_invoice_history_failed", { orderId: order.orderId, messageId, detail: error.message });
  }
  return { ok: true, messageId };
}

async function sendPaymentUnsuccessfulWhatsApp({ order }) {
  const account = await withAccount(order);
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const whatsappNumber = order.customer?.whatsappNumber || order.customer?.phone;
  const orderId = String(order.orderId || "");
  const { conversation, customerWaId } = await prepareConversation(
    account,
    whatsappNumber,
    order.customer?.name || "",
  );

  // Template has WhatsApp Flow "Write about Issue" — wait for flow reply / chat details.
  conversation.flowState = {
    type: "payment_issue",
    step: "awaiting_issue_details",
    orderId,
    startedAt: new Date().toISOString(),
    via: "payment_unsuccessful_template",
  };
  await conversation.save();

  const bodyText = [
    "Payment unsuccessful raha ❌",
    "",
    orderId ? `Order ID: ${orderId}` : "",
    "",
    "Kya payment karne mein koi issue ho rha hai?",
    "Issue batane ke liye *Write about Issue* button use karein.",
  ].filter(Boolean).join("\n");

  const templates = env.whatsapp.templates || {};
  // payment_unsuccessful has a FLOW button — Meta requires button/sub_type=flow.
  const { result, usedTemplate } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: templates.paymentFailed,
    languageCode: templates.paymentFailedLanguage || "en",
    components: [
      {
        type: "button",
        sub_type: "flow",
        index: "0",
        parameters: [
          {
            type: "action",
            action: {
              flow_token: `payment_issue_${orderId || Date.now()}`,
            },
          },
        ],
      },
    ],
    fallback: async () => sendInteractiveMessage({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      to: customerWaId,
      interactive: {
        type: "button",
        body: { text: bodyText.slice(0, 1024) },
        action: {
          buttons: [
            { type: "reply", reply: { id: "payment_issue_yes", title: "Yes" } },
            { type: "reply", reply: { id: "payment_issue_no", title: "No" } },
          ],
        },
      },
    }),
  });

  // If template with Flow sent OK, do not spam Yes/No. Fallback path already has buttons.
  if (!usedTemplate) {
    conversation.flowState = {
      ...conversation.flowState,
      step: "ask_if_issue",
    };
    await conversation.save();
  }

  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: "interactive",
    text: bodyText,
    buttons: usedTemplate
      ? [{ type: "flow", label: "Write about Issue" }]
      : [
        { type: "quick_reply", label: "Yes", payload: "payment_issue_yes" },
        { type: "quick_reply", label: "No", payload: "payment_issue_no" },
      ],
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "payment_unsuccessful", orderId, templateSent: usedTemplate },
  });

  return { ok: true };
}

async function sendPaymentReceivedWhatsApp({ order }) {
  if (order.whatsappVoiceCall && !order.whatsappVoiceMessaging) return { ok: false, reason: "messaging_not_requested" };
  const account = await withAccount(order);
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const whatsappNumber = order.customer?.whatsappNumber || order.customer?.phone;
  const name = String(order.customer?.name || "Customer").trim().slice(0, 60) || "Customer";
  const amount = formatInrAmount(order.total);
  const paidOn = formatPaymentDate(order.paidAt || new Date());
  const { conversation, customerWaId } = await prepareConversation(
    account,
    whatsappNumber,
    name,
  );
  await greetBeforeOrderUpdate({ account, conversation, customerWaId, order });

  const templates = env.whatsapp.templates || {};
  const receiptUrl = trackOrderUrl(order.orderId);
  const bodyText = `Hi ${name}, your Order bill payment of ${amount} has been successfully received. Your payment date was ${paidOn}. Thank you!`;
  const credentials = { phoneNumberId: account.phoneNumberId, accessToken: account.accessToken, to: customerWaId };

  const { result } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: templates.paymentReceived,
    languageCode: templates.paymentReceivedLanguage || "en_US",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: name },
          { type: "text", text: "Order" },
          { type: "text", text: amount },
          { type: "text", text: paidOn },
        ],
      },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: encodeURIComponent(order.orderId) }] },
    ],
    fallback: await voiceOrderMaySendFreeForm(order) ? async () => {
      try {
        return await sendInteractiveMessage({
          ...credentials,
          interactive: {
            type: "cta_url",
            body: { text: bodyText },
            action: { name: "cta_url", parameters: { display_text: "Receipt", url: receiptUrl } },
          },
        });
      } catch (_error) {
        return sendTextMessage({ ...credentials, text: `${bodyText}\n\nReceipt: ${receiptUrl}` });
      }
    } : null,
  });

  if (!result) return { ok: false, reason: "template_unavailable" };
  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: "text",
    text: bodyText,
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "payment_received", orderId: order.orderId, receiptUrl },
  });

  return { ok: true };
}

async function sendOrderShipmentWhatsApp({ order }) {
  const account = await withAccount(order);
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const whatsappNumber = order.customer?.whatsappNumber || order.customer?.phone;
  const orderId = String(order.orderId || "");
  const trackUrl = trackOrderUrl(orderId);
  const { conversation, customerWaId } = await prepareConversation(
    account,
    whatsappNumber,
    order.customer?.name || "",
  );

  conversation.lastCopyCodes = {
    ...(conversation.lastCopyCodes || {}),
    orderId,
  };
  await conversation.save();

  const bodyText = [
    `Your order *${orderId}* has shipped!`,
    "",
    "Here's your tracking information, please check link below.",
  ].join("\n");

  const templates = env.whatsapp.templates || {};
  const { result } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: templates.orderShipment,
    languageCode: templates.orderShipmentLanguage || "en",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: orderId }],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: orderId }],
      },
    ],
    fallback: async () => sendInteractiveMessage({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      to: customerWaId,
      interactive: {
        type: "cta_url",
        body: { text: bodyText.slice(0, 1024) },
        action: {
          name: "cta_url",
          parameters: { display_text: "Track Shipment", url: trackUrl },
        },
      },
    }),
  });

  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: "interactive",
    text: bodyText,
    buttons: [{ type: "url", label: "Track Shipment", url: trackUrl }],
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "order_shipment", orderId },
  });

  return { ok: true };
}

async function sendCustomerProductReviewWhatsApp({ order, product }) {
  const whatsappNumber = order.customer?.whatsappNumber;
  if (!/^91[6-9]\d{9}$/.test(toWhatsAppE164(whatsappNumber))) return { ok: false, reason: "whatsapp_number_missing" };
  const account = await withAccount(order);
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const customerWaId = toWhatsAppE164(whatsappNumber);
  const name = String(order.customer?.name || "there").trim().split(/\s+/)[0].slice(0, 60) || "there";
  const productName = String(product.productName || "purchase").trim().replace(/\s+/g, " ").slice(0, 120);
  const suffix = encodeURIComponent(String(product.productId));
  const reviewUrl = new URL(`/product/${suffix}`, env.productionUrl).href;
  const bodyText = `Hi ${name}, how was your ${productName} from Prakash Electronics? Please rate the product and share your experience. Your feedback helps other shoppers.`;
  const templates = env.whatsapp.templates || {};

  const result = await sendTemplateMessage({
    phoneNumberId: account.phoneNumberId, accessToken: account.accessToken, to: customerWaId,
    templateName: templates.customerProductReview,
    languageCode: templates.customerProductReviewLanguage,
    components: [
      { type: "body", parameters: [name, productName].map((text) => ({ type: "text", text })) },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: suffix }] },
    ],
  });
  const messageId = result?.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp did not acknowledge the review request");

  void prepareConversation(account, whatsappNumber, name).then(({ conversation }) => recordOutbound({
    account, conversation, customerWaId, type: "text", text: bodyText,
    buttons: [{ type: "url", label: "Review product", url: reviewUrl }], waMessageId: messageId,
    meta: { kind: "customer_product_review", orderId: order.orderId },
  })).catch((error) => logger.warn("whatsapp.customer_review_history_failed", { code: error.code }));

  return { ok: true };
}

function isYesAnswer(text = "") {
  const value = String(text || "").trim().toLowerCase();
  return /^(yes|y|haan|han|ha|haa|ji|ok|okay|yess+)$/i.test(value)
    || value.includes("payment_issue_yes")
    || value.startsWith("button: payment_issue_yes");
}

function isNoAnswer(text = "") {
  const value = String(text || "").trim().toLowerCase();
  return /^(no|n|nahi|nahe|na)$/i.test(value)
    || value.includes("payment_issue_no")
    || value.startsWith("button: payment_issue_no");
}

/**
 * Handle payment-issue guided flow. Returns true if handled (skip normal greeting/AI).
 */
async function handlePaymentIssueFlow({
  account,
  conversation,
  customerMessage,
  buttonReplyId,
  isFlowReply = false,
  flowReplyBody = "",
  flowReplyResponseJson = "",
}) {
  const flow = conversation.flowState;
  if (!flow || flow.type !== "payment_issue" || flow.step === "done") {
    return { handled: false };
  }

  const input = String(buttonReplyId || customerMessage || "").trim();
  const creds = {
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: conversation.customerWaId,
  };

  // WhatsApp Flow "Write about Issue" completed
  if (isFlowReply && (flow.step === "awaiting_issue_details" || flow.step === "ask_if_issue")) {
    let issueText = String(flowReplyBody || customerMessage || "").trim();
    if (flowReplyResponseJson) {
      try {
        const parsed = JSON.parse(flowReplyResponseJson);
        const parts = Object.values(parsed || {})
          .filter((value) => typeof value === "string" && value.trim())
          .map((value) => value.trim());
        if (parts.length) issueText = parts.join(" | ");
      } catch (_error) {
        // keep body text
      }
    }
    conversation.flowState = {
      ...flow,
      step: "done",
      issueText: issueText.slice(0, 1000),
      reportedAt: new Date().toISOString(),
      via: "whatsapp_flow",
    };
    conversation.conversationMemory = {
      ...(conversation.conversationMemory || {}),
      paymentIssue: {
        orderId: flow.orderId || "",
        issueText: issueText.slice(0, 1000),
        reportedAt: new Date().toISOString(),
        via: "whatsapp_flow",
      },
    };
    await conversation.save();
    const text = "Dhanyavaad. Humne aapka payment issue review ke liye bhej diya hai. Team jald check karegi.";
    const result = await sendTextMessage({ ...creds, text });
    await recordOutbound({
      account,
      conversation,
      customerWaId: conversation.customerWaId,
      type: "text",
      text,
      waMessageId: result?.messages?.[0]?.id || "",
      meta: { kind: "payment_issue_submitted", orderId: flow.orderId || "", via: "flow" },
    });
    logger.info("whatsapp.payment_issue_reported", {
      orderId: flow.orderId || "",
      customerWaId: conversation.customerWaId,
      issueText: issueText.slice(0, 200),
      via: "flow",
    });
    return { handled: true };
  }

  if (flow.step === "ask_if_issue") {
    if (isYesAnswer(input) || buttonReplyId === "payment_issue_yes") {
      conversation.flowState = { ...flow, step: "awaiting_issue_details" };
      await conversation.save();
      const text = "Theek hai. Please batayiye payment mein kya issue aa rha hai?";
      const result = await sendTextMessage({ ...creds, text });
      await recordOutbound({
        account,
        conversation,
        customerWaId: conversation.customerWaId,
        type: "text",
        text,
        waMessageId: result?.messages?.[0]?.id || "",
        meta: { kind: "payment_issue_ask_details" },
      });
      return { handled: true };
    }

    if (isNoAnswer(input) || buttonReplyId === "payment_issue_no") {
      conversation.flowState = { ...flow, step: "done" };
      await conversation.save();
      const text = "Theek hai. Jab ready ho payment dubara try kar sakte ho. Koi aur help chahiye toh bata dena.";
      const result = await sendTextMessage({ ...creds, text });
      await recordOutbound({
        account,
        conversation,
        customerWaId: conversation.customerWaId,
        type: "text",
        text,
        waMessageId: result?.messages?.[0]?.id || "",
        meta: { kind: "payment_issue_no" },
      });
      return { handled: true };
    }

    // Unclear — re-ask briefly
    const text = "Bas Yes ya No mein bata do — kya payment karne mein koi issue ho rha hai?";
    const result = await sendInteractiveMessage({
      ...creds,
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: [
            { type: "reply", reply: { id: "payment_issue_yes", title: "Yes" } },
            { type: "reply", reply: { id: "payment_issue_no", title: "No" } },
          ],
        },
      },
    });
    await recordOutbound({
      account,
      conversation,
      customerWaId: conversation.customerWaId,
      type: "interactive",
      text,
      waMessageId: result?.messages?.[0]?.id || "",
      meta: { kind: "payment_issue_reask" },
    });
    return { handled: true };
  }

  if (flow.step === "awaiting_issue_details") {
    const issueText = String(customerMessage || input || "").trim();
    conversation.flowState = {
      ...flow,
      step: "done",
      issueText: issueText.slice(0, 1000),
      reportedAt: new Date().toISOString(),
    };
    conversation.conversationMemory = {
      ...(conversation.conversationMemory || {}),
      paymentIssue: {
        orderId: flow.orderId || "",
        issueText: issueText.slice(0, 1000),
        reportedAt: new Date().toISOString(),
      },
    };
    await conversation.save();

    const text = "Dhanyavaad. Humne aapka payment issue review ke liye bhej diya hai. Team jald check karegi.";
    const result = await sendTextMessage({ ...creds, text });
    await recordOutbound({
      account,
      conversation,
      customerWaId: conversation.customerWaId,
      type: "text",
      text,
      waMessageId: result?.messages?.[0]?.id || "",
      meta: { kind: "payment_issue_submitted", orderId: flow.orderId || "" },
    });
    logger.info("whatsapp.payment_issue_reported", {
      orderId: flow.orderId || "",
      customerWaId: conversation.customerWaId,
      issueText: issueText.slice(0, 200),
    });
    return { handled: true };
  }

  return { handled: false };
}

async function resolveCopyCodeFromConversation(conversation, buttonReplyId = "", buttonTitle = "") {
  if (buttonReplyId?.startsWith("copy:")) {
    return buttonReplyId.slice(5).trim();
  }
  const title = String(buttonTitle || buttonReplyId || "").toLowerCase();
  if (title.includes("booking") && conversation.lastCopyCodes?.bookingId) {
    return conversation.lastCopyCodes.bookingId;
  }
  if (title.includes("order") && conversation.lastCopyCodes?.orderId) {
    return conversation.lastCopyCodes.orderId;
  }
  return "";
}

async function sendCopyCodeReply({ account, conversation, code, label = "Code" }) {
  const text = formatCopyCodeMessage(code, label);
  const result = await sendTextMessage({
    phoneNumberId: account.phoneNumberId,
    accessToken: account.accessToken,
    to: conversation.customerWaId,
    text,
  });
  await recordOutbound({
    account,
    conversation,
    customerWaId: conversation.customerWaId,
    type: "text",
    text,
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { copyCode: code },
  });
  return { ok: true };
}

module.exports = {
  sendOtpWhatsApp,
  sendBookingConfirmationWhatsApp,
  sendOrderConfirmationWhatsApp,
  sendOrderInvoiceWhatsApp,
  sendPaidOrderCardStatus,
  sendPaymentUnsuccessfulWhatsApp,
  sendPaymentReceivedWhatsApp,
  sendOrderShipmentWhatsApp,
  sendCustomerProductReviewWhatsApp,
  handlePaymentIssueFlow,
  resolveCopyCodeFromConversation,
  sendCopyCodeReply,
  trackOrderUrl,
  toWhatsAppE164,
  toLocalTenDigit,
};
