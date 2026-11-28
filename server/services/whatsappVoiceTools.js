const { z } = require("zod4");
const { Types } = require("mongoose");
const Call = require("../models/WhatsAppVoiceCall");
const Booking = require("../models/Booking");
const Order = require("../models/Order");
const Conversation = require("../models/WhatsAppConversation");
const { searchPublicProducts } = require("../controllers/shopProductController");
const { resolveProductPricing } = require("../utils/productPricing");
const { formatVariantSummary, resolveVariantPricing, resolveVariantStock } = require("../utils/productVariants");
const { validateEmailDeliverability } = require("../utils/validateEmail");
const { createRepairBooking } = require("./whatsappRepairBookingService");
const { previewCheckout, handleCheckoutButton } = require("./whatsappCheckoutService");
const { sendPaymentRequest } = require("./whatsappPaymentRequestService");
const { sendBookingConfirmationWhatsApp } = require("./whatsappTransactionalService");
const { logger } = require("../utils/logger");

const confirmation = {
  repair: /^(?:(?:yes )?confirm (?:the )?repair(?: booking)?|(?:haan )?repair (?:booking )?confirm (?:karo|kijiye)|(?:हाँ )?रिपेयर (?:बुकिंग )?कन्फर्म कीजिए)$/iu,
  order: /^(?:(?:yes )?confirm (?:the )?order|(?:haan )?order confirm (?:karo|kijiye)|(?:हाँ )?ऑर्डर कन्फर्म कीजिए)$/iu,
  callback: /^(?:please call me back|(?:haan )?mujhe callback kijiye|मुझे कॉलबैक कीजिए)$/iu,
  summary: /^(?:save the call topic|call ka topic save kijiye|कॉल का विषय सेव कीजिए)$/iu,
};
const messageSuffix = /(?: and message me| aur whatsapp par bhejo| और व्हाट्सऐप पर भेजिए)$/iu;
const confirmationPrompt = {
  repair: "Confirm the repair", order: "Confirm the order", callback: "Please call me back",
  summary: "Save the call topic",
};

function createConfirmation() {
  let pending;
  let grant;
  let activeItem;
  let beganAt = 0;
  function clear() {
    pending = undefined;
    grant = undefined;
  }
  return {
    clear,
    arm(kind) {
      clear();
      pending = { kind, issuedAt: Date.now() };
    },
    speechStarted(at, itemId) {
      beganAt = at;
      activeItem = itemId;
      grant = undefined;
    },
    transcript({ isFinal, transcript, itemId }) {
      if (!isFinal || !itemId || itemId !== activeItem) return;
      activeItem = undefined;
      if (!pending || beganAt <= pending.issuedAt || typeof transcript !== "string") return;
      const words = transcript.toLowerCase().normalize("NFKC").replace(/[,.!?।]/gu, "")
        .replace(/कन्फ़र्म|कंफ़र्म|कंफर्म|कनफर्म/gu, "कन्फर्म")
        .replace(/व्हाट्सएप|व्हाट्सएप्प/gu, "व्हाट्सऐप")
        .trim().replace(/\s+/g, " ");
      const message = messageSuffix.test(words);
      if (confirmation[pending.kind].test(words.replace(messageSuffix, ""))) {
        grant = { kind: pending.kind, message, expires: Date.now() + 15_000 };
      }
    },
    get(kind) {
      return grant?.kind === kind && grant.expires >= Date.now() ? grant : null;
    },
  };
}

const text = (max) => z.string().trim().min(1).max(max);
const objectId = z.string().regex(/^[\da-f]{24}$/i);
const localPhone = z.string().regex(/^[6-9]\d{9}$/);
const location = {
  address: text(500), pincode: z.string().regex(/^\d{6}$/), landmark: z.string().trim().max(160).optional(),
};
const callerPhones = (phone) => {
  const local = /^91([6-9]\d{9})$/.exec(phone || "")?.[1];
  return local ? [local, `91${local}`, `+91${local}`] : [];
};

async function getConversation(account, phone) {
  const filter = { account: account._id, customerWaId: phone };
  try {
    return await Conversation.findOneAndUpdate(filter, { $setOnInsert: filter },
      { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false }).select("_id").lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Conversation.findOne(filter).select("_id").lean();
  }
}

function createVoiceTools({ call, account, consent, stopped = () => false, services = {} }) {
  const deps = {
    searchPublicProducts, validateEmailDeliverability, createRepairBooking, previewCheckout, handleCheckoutButton,
    sendPaymentRequest, sendBookingConfirmationWhatsApp, getConversation, Booking, Order, Call, ...services,
  };
  const phones = callerPhones(call.phone);
  let repair;
  let bookingResult;
  let order;
  let orderResult;
  let callbackRequested = false;
  let summaryTopic;
  let summarySaved = false;
  let tail = Promise.resolve();
  const conversation = {
    customerWaId: phones[1],
    voiceCallId: call._id,
    markModified() {},
    async save() {},
  };
  const unavailable = { status: "unavailable", message: "The operation could not be verified. Ask the caller to try again." };

  async function callIsActive() {
    const exists = await deps.Call.exists({ _id: call._id, state: "active", deadline: { $gt: new Date() } });
    return Boolean(exists) && !stopped();
  }

  function tool(description, parameters, run, { requiresPhone = false } = {}) {
    return {
      description, parameters,
      execute(input, { abortSignal } = {}) {
        const result = tail.then(async () => {
          if (stopped() || abortSignal?.aborted) return unavailable;
          const parsed = parameters.safeParse(input);
          if (!parsed.success) return { status: "invalid_details", fields: parsed.error.issues.map((issue) => issue.path.join(".")) };
          if (requiresPhone && !phones.length) return { status: "verified_number_required", message: "Direct the caller to the shop website or WhatsApp chat for this action." };
          return run(parsed.data);
        }).catch(() => {
          logger.warn("whatsapp.voice.tool_failed");
          return unavailable;
        });
        tail = result;
        return result;
      },
    };
  }

  const empty = z.strictObject({});
  const withPhone = { requiresPhone: true };
  const instructionsFor = (kind, { requireMessage = false } = {}) => ({
    status: "awaiting_confirmation",
    phrase: confirmationPrompt[kind] + (requireMessage ? " and message me" : ""),
    ...(["order", "repair"].includes(kind) && !requireMessage && { optionalWhatsAppPhrase: confirmationPrompt[kind] + " and message me" }),
  });

  function orderReview(result, method) {
    if (stopped()) return unavailable;
    const valid = result.buttons?.some((button) => button.payload === `checkout:${method}:${conversation.checkout?.token}`);
    if (!valid) {
      order = undefined;
      consent.clear();
      return { status: "review_unavailable", details: result.text };
    }
    order = { method, token: conversation.checkout.token };
    consent.arm("order");
    return { ...instructionsFor("order", { requireMessage: method === "online" }),
      method, summary: result.voiceSummary || result.text };
  }

  return {
    search_products: tool("Search the live catalog for real prices and available stock. Use the returned product and variant IDs for order review.", z.strictObject({ query: text(120) }), async ({ query }) => {
      const { items } = await deps.searchPublicProducts({ search: query, limit: 5 });
      return items.map((product) => ({
        sourceId: product.sourceId, sourceType: product.sourceType, name: product.name,
        ...(!product.hasVariants && { priceINR: resolveProductPricing(product).price, stock: product.stockQuantity }),
        ...(product.hasVariants && { variants: product.variantCombinations
          .slice(0, 12).map((variant) => ({ id: variant.id, name: formatVariantSummary(product, variant.optionIds),
            priceINR: resolveVariantPricing(product, variant).price, stock: resolveVariantStock(product, variant) })) }),
      }));
    }),
    review_repair: tool("Prepare a repair review. Collect each detail individually. Read back the entire summary and ask the caller to speak the confirmation phrase. Ask if they want a WhatsApp confirmation.", z.strictObject({
      fullName: text(120), customerEmail: z.email().max(254).optional(), phoneNumber: localPhone,
      device: text(100), brand: text(45).optional(), model: text(45).optional(), problem: text(750), ...location,
    }), async ({ device, brand, model, problem, customerEmail, ...data }) => {
      if (bookingResult) return bookingResult;
      consent.clear();
      repair = undefined;
      if (customerEmail) {
        const email = await deps.validateEmailDeliverability(customerEmail);
        if (!email.valid) return { status: "invalid_email" };
        data.customerEmail = email.email || customerEmail;
      }
      const details = { ...data, repairType: [device, brand, model].filter(Boolean).join(" "), message: problem, whatsappNumber: phones[1] };
      if (stopped()) return unavailable;
      repair = { id: new Types.ObjectId().toString(), data: details };
      consent.arm("repair");
      return { ...instructionsFor("repair"), summary: { ...details, whatsappNumber: undefined } };
    }, withPhone),
    submit_repair: tool("Submit the existing repair review only after the caller speaks the confirmation phrase.", empty, async () => {
      if (bookingResult) return bookingResult;
      if (!repair || !consent.get("repair")) return instructionsFor("repair");
      if (!await callIsActive()) return unavailable;
      const grant = consent.get("repair");
      if (!grant) return instructionsFor("repair");
      const booking = await deps.createRepairBooking({ ...repair, source: "whatsapp-voice" });
      if (!booking?._id) return unavailable;
      bookingResult = { status: "booked", reference: String(booking._id), whatsappRequested: grant.message };
      consent.clear();
      if (grant.message && account) {
        const sent = await deps.sendBookingConfirmationWhatsApp({ booking, senderAccount: account, templateOnly: true }).catch(() => null);
        bookingResult.whatsappAccepted = Boolean(sent?.ok);
      }
      return bookingResult;
    }, withPhone),
    review_order: tool("Quote the live order using catalog IDs and exact delivery details. Read back products, quantities, delivery, charges and total, then ask for the confirmation phrase. Online orders require consent to send the payment request through WhatsApp.", z.strictObject({
      method: z.enum(["online", "cod"]),
      customer: z.strictObject({ name: text(100), phone: localPhone, ...location, message: z.string().max(1000).optional() }),
      items: z.array(z.strictObject({ sourceType: z.enum(["shop-product", "project-part"]), sourceId: objectId,
        quantity: z.number().int().min(1).max(99), variantCombinationId: text(100).optional() })).min(1).max(20),
      couponCode: z.string().trim().max(60).optional(),
    }), async ({ method, ...patch }) => {
      if (orderResult || conversation.checkout?.orderId) return orderResult || { status: "order_already_started" };
      consent.clear();
      order = undefined;
      if (!account) return { status: "checkout_unavailable" };
      conversation._id ||= (await deps.getConversation(account, phones[1]))?._id;
      if (!conversation._id || stopped()) return unavailable;
      // Each review replaces the draft so removed items and delivery fields cannot carry over.
      conversation.checkout = null;
      return orderReview(await deps.previewCheckout({ account, conversation, patch }), method);
    }, withPhone),
    submit_order: tool("Place the reviewed order only after the caller speaks the confirmation phrase. For online payment say the order awaits payment, and report whether WhatsApp accepted the payment message.", empty, async () => {
      if (orderResult) return orderResult;
      const alreadyCreated = Boolean(conversation.checkout?.orderId);
      if (!order || (!alreadyCreated && !consent.get("order"))) {
        return instructionsFor("order", { requireMessage: order?.method === "online" });
      }
      if (!await callIsActive()) return unavailable;
      const grant = consent.get("order");
      if (!alreadyCreated && (!grant || (order.method === "online" && !grant.message))) {
        return instructionsFor("order", { requireMessage: order?.method === "online" });
      }
      if (!alreadyCreated) conversation.voiceMessaging = grant.message;
      const result = await deps.handleCheckoutButton({ account, conversation,
        buttonReplyId: `checkout:${order.method}:${order.token}` });
      if (conversation.checkout?.token !== order.token) return orderReview(result, order.method);
      if (!conversation.checkout?.orderId) return { status: "not_placed", details: result.text };
      const reference = conversation.checkout.orderId;
      consent.clear();
      if (result.voiceOrder?.orderStatus === "cancelled") {
        orderResult = { status: "cancelled", reference };
      } else if (["paid", "refunded"].includes(result.voiceOrder?.paymentStatus)) {
        orderResult = { status: result.voiceOrder.paymentStatus, reference, orderStatus: result.voiceOrder.orderStatus };
      } else if (order.method === "cod") {
        if (result.voiceOrder?.paymentStatus !== "cod" || result.voiceOrder?.orderStatus !== "confirmed") return unavailable;
        orderResult = { status: "confirmed_cod", reference, whatsappRequested: Boolean(conversation.voiceMessaging) };
      } else {
        const sent = result.paymentRequestOrderId === reference
          ? await deps.sendPaymentRequest({ account, conversation, orderId: reference }).catch(() => null) : null;
        const payment = { status: "awaiting_payment", reference, whatsappAccepted: Boolean(sent?.sent) };
        if (!sent?.sent) return payment; // Allow a retry against the same order and payment link.
        orderResult = payment;
      }
      return orderResult;
    }, withPhone),
    discard_review: tool("If the caller cancels an unsubmitted review, discard that draft and its confirmation. This cannot cancel an existing booking or order.", z.strictObject({
      kind: z.enum(["repair", "order"]),
    }), async ({ kind }) => {
      if (kind === "repair" && bookingResult) return { status: "already_submitted" };
      if (kind === "order" && (orderResult || conversation.checkout?.orderId)) return { status: "already_submitted" };
      consent.clear();
      if (kind === "repair") repair = undefined;
      else {
        order = undefined;
        conversation.checkout = null;
      }
      return { status: "draft_discarded" };
    }),
    track_order: tool("Fetch only the status of an order for this verified caller. Ask for the order reference. Use the website's verified order history for any additional account details.", z.strictObject({
      reference: z.string().trim().regex(/^PE[A-Z2-9]{10}$/i),
    }), async ({ reference }) => {
      const found = await deps.Order.findOne({ orderId: reference.toUpperCase(),
        "customer.whatsappNumber": { $in: phones } }).select("orderStatus paymentStatus").lean();
      return found ? { status: found.orderStatus, paymentStatus: found.paymentStatus } : { status: "not_found_for_this_caller" };
    }, withPhone),
    track_repair: tool("Fetch only the status of a repair for this verified caller. Ask for the booking reference.", z.strictObject({
      reference: objectId,
    }), async ({ reference }) => {
      const found = await deps.Booking.findOne({ _id: reference, whatsappNumber: { $in: phones } }).select("status").lean();
      return found ? { status: found.status } : { status: "not_found_for_this_caller" };
    }, withPhone),
    offer_callback: tool("Offer a human support callback on this same WhatsApp caller's number and ask them to speak the confirmation phrase.", empty, async () => {
      consent.arm("callback");
      return instructionsFor("callback");
    }, withPhone),
    request_callback: tool("Queue the offered callback only after the caller speaks the confirmation phrase. Do not promise a time.", empty, async () => {
      if (callbackRequested) return { status: "callback_requested" };
      if (!consent.get("callback")) return instructionsFor("callback");
      const result = await deps.Call.updateOne({ _id: call._id, state: "active",
        deadline: { $gt: new Date() }, callback: { $exists: false } },
        { $set: { callback: "requested", callbackAt: new Date() } });
      if (!result.modifiedCount) return unavailable;
      callbackRequested = true;
      consent.clear();
      return { status: "callback_requested" };
    }, withPhone),
    offer_call_topic: tool("Only if the caller asks to leave a note for the shop, offer to save one broad topic for staff. State the topic and ask for explicit consent to save it.", z.strictObject({
      topic: z.enum(["catalog", "order", "repair", "payment", "general_support"]),
    }), async ({ topic }) => {
      if (summarySaved) return { status: "topic_saved" };
      summaryTopic = topic;
      consent.arm("summary");
      return instructionsFor("summary");
    }),
    save_call_topic: tool("Save the offered topic after explicit consent. The topic is the only detail saved, with no audio or transcript.", empty, async () => {
      if (summarySaved) return { status: "topic_saved" };
      if (!summaryTopic || !consent.get("summary")) return instructionsFor("summary");
      const result = await deps.Call.updateOne({ _id: call._id, state: "active",
        deadline: { $gt: new Date() }, summaryConsentAt: { $exists: false } },
        { $set: { summaryTopic, summaryConsentAt: new Date() } });
      if (!result.modifiedCount) return unavailable;
      summarySaved = true;
      consent.clear();
      return { status: "topic_saved" };
    }),
  };
}

module.exports = { createVoiceTools, createConfirmation };
