const env = require("../config/env");
const { logger } = require("../utils/logger");
const {
  sendTextMessage,
  sendInteractiveMessage,
  sendTemplateMessage,
} = require("./whatsappCloudApiService");
const { recordMessage, upsertConversation } = require("./whatsappConversationService");
const { formatCopyCodeMessage } = require("./whatsappFormatService");
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

async function withAccount() {
  const account = await getActiveWhatsAppAccount();
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
      logger.warn("whatsapp.template_failed_fallback", {
        templateName,
        message: error.message,
        status: error.status,
        details: error.payload?.error || null,
      });
    }
  }
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

/** Send 6-digit OTP via AUTH template (Copy code) or plain text fallback. */
async function sendOtpWhatsApp({ whatsappNumber, otp, customerName = "" }) {
  const account = await withAccount();
  if (!account) {
    const err = new Error("WhatsApp is not configured. OTP cannot be sent.");
    err.status = 503;
    throw err;
  }

  const { conversation, customerWaId } = await prepareConversation(account, whatsappNumber, customerName);
  const otpText = String(otp);
  const templates = env.whatsapp.templates || {};

  // pulse_otp_verify is AUTH Copy-code: language en_GB, button sub_type url with OTP text.
  const { result } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: templates.otp,
    languageCode: templates.otpLanguage || "en_GB",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: otpText }],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: otpText }],
      },
    ],
    fallback: async () => {
      const text = [
        "Prakash Electronics verification code:",
        "",
        `*${otpText}*`,
        "",
        "Ye 6-digit code website par daalein. Kisi ke sath share mat karna.",
        "Code 5 minute ke liye valid hai.",
      ].join("\n");
      return sendTextMessage({
        phoneNumberId: account.phoneNumberId,
        accessToken: account.accessToken,
        to: customerWaId,
        text,
      });
    },
  });

  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: "text",
    text: `OTP sent for verification (${otpText.length} digits)`,
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "otp" },
  });

  return { ok: true, customerWaId };
}

async function sendBookingConfirmationWhatsApp({ booking }) {
  const account = await withAccount();
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
    fallback: async () => {
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
  const account = await withAccount();
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

  const customerName = String(order.customer?.name || "").trim();
  const bodyText = [
    `Namaste${customerName ? ` ${customerName}` : ""},`,
    "Prakash Electronics mein aapka order confirm ho gaya hai aur payment receive ho gayi hai.",
    "",
    `*Order ID:* ${orderId}`,
    "",
    "Order ki status aur delivery updates ke liye neeche diye gaye link par jaayein.",
    "Dhanyavaad, Prakash Electronics.",
  ].join("\n");

  const templates = env.whatsapp.templates || {};
  // Template URL is https://prakashelectronics.in/orders?id={{1}} → button param is Order ID only.
  const { result, usedTemplate } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: templates.orderConfirm,
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
    fallback: async () => {
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
    },
  });

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

async function sendPaymentUnsuccessfulWhatsApp({ order }) {
  const account = await withAccount();
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
  const account = await withAccount();
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

  const templates = env.whatsapp.templates || {};
  const bodyText = `Hi ${name}, your Order bill payment of ${amount} has been successfully received. Your payment date was ${paidOn}. Thank you!`;

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
    ],
    fallback: async () => sendTextMessage({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      to: customerWaId,
      text: bodyText,
    }),
  });

  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: "text",
    text: bodyText,
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "payment_received", orderId: order.orderId },
  });

  return { ok: true };
}

async function sendOrderShipmentWhatsApp({ order }) {
  const account = await withAccount();
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

async function sendCustomerReviewWhatsApp({ order }) {
  const account = await withAccount();
  if (!account) return { ok: false, reason: "whatsapp_disabled" };

  const whatsappNumber = order.customer?.whatsappNumber || order.customer?.phone;
  const name = String(order.customer?.name || "Customer").trim().slice(0, 60) || "Customer";
  const { conversation, customerWaId } = await prepareConversation(
    account,
    whatsappNumber,
    name,
  );

  const bodyText = `Hi 👋 *${name}*, humare sath judne ke liye shukriya! Apna feedback zaroor share karein.`;
  const templates = env.whatsapp.templates || {};

  const { result } = await tryTemplateThenFallback({
    account,
    customerWaId,
    templateName: templates.customerReview,
    languageCode: templates.customerReviewLanguage || "en",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: name }],
      },
      {
        type: "button",
        sub_type: "flow",
        index: "0",
        parameters: [
          {
            type: "action",
            action: {
              flow_token: `customer_review_${order.orderId || Date.now()}`,
            },
          },
        ],
      },
    ],
    fallback: async () => sendTextMessage({
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
      to: customerWaId,
      text: `${bodyText}\n\nFeedback ke liye humse WhatsApp pe reply kar sakte ho.`,
    }),
  });

  await recordOutbound({
    account,
    conversation,
    customerWaId,
    type: "text",
    text: bodyText,
    waMessageId: result?.messages?.[0]?.id || "",
    meta: { kind: "customer_review", orderId: order.orderId },
  });

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

function shouldSuppressGreeting(conversation) {
  if (!conversation?.suppressGreetingUntil) return false;
  return new Date(conversation.suppressGreetingUntil).getTime() > Date.now();
}

module.exports = {
  sendOtpWhatsApp,
  sendBookingConfirmationWhatsApp,
  sendOrderConfirmationWhatsApp,
  sendPaymentUnsuccessfulWhatsApp,
  sendPaymentReceivedWhatsApp,
  sendOrderShipmentWhatsApp,
  sendCustomerReviewWhatsApp,
  handlePaymentIssueFlow,
  resolveCopyCodeFromConversation,
  sendCopyCodeReply,
  shouldSuppressGreeting,
  trackOrderUrl,
  toWhatsAppE164,
  toLocalTenDigit,
};
