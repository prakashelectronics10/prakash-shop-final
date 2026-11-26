const crypto = require("crypto");
const { z } = require("zod");
const Order = require("../models/Order");
const AppError = require("../utils/AppError");
const WhatsAppAISettings = require("../models/WhatsAppAISettings");
const { createPaymentLink, findPaymentLinks, getPaymentLink, getRazorpayPayment, cancelPaymentLink } = require("./razorpayService");
const { enqueueOrderPaidNotification } = require("./orderNotificationService");

const orderPatchSchema = z.object({
  customer: z.object({
    name: z.string().trim().max(100).optional(), phone: z.string().trim().max(20).optional(),
    address: z.string().trim().max(500).optional(), pincode: z.string().trim().max(6).optional(),
    landmark: z.string().trim().max(160).optional(), message: z.string().trim().max(1000).optional(),
  }).optional(),
  items: z.array(z.object({
    sourceType: z.enum(["shop-product", "project-part"]), sourceId: z.string().regex(/^[a-f\d]{24}$/i),
    quantity: z.number().int().min(1).max(99), variantCombinationId: z.string().max(100).optional(),
  })).min(1).max(20).refine((items) => new Set(items.map((i) => `${i.sourceType}:${i.sourceId}:${i.variantCombinationId || ""}`)).size === items.length, "Combine duplicate products into a single quantity").optional(),
  couponCode: z.string().trim().max(60).optional(),
}).strict();

const reply = (text, buttons = []) => ({ text, buttons, images: [], model: "checkout" });
const button = (label, action, token) => ({ type: "quick_reply", label, payload: `checkout:${action}:${token}` });
const money = (value) => `Rs. ${Number(value).toFixed(2)}`;
function fingerprint(quote) {
  return crypto.createHash("sha256").update(JSON.stringify({
    items: quote.items.map((i) => [String(i.productId), i.variantCombinationId, i.quantity, i.unitPrice, i.discountedLineTotal, i.couponCode]),
    charges: quote.additionalCharges.map((c) => [c.slug, c.amount]), total: quote.total,
  })).digest("hex");
}

async function saveDraft(conversation, draft) {
  conversation.checkout = draft;
  conversation.markModified("checkout");
  await conversation.save();
}

async function savedDelivery(customerWaId) {
  const match = /^(?:91)?([6-9]\d{9})$/.exec(String(customerWaId || ""));
  if (!match) return null;
  const number = match[1];
  const previous = await Order.findOne({
    "customer.whatsappNumber": { $in: [number, `91${number}`, `+91${number}`] },
    orderStatus: { $nin: ["awaiting_payment", "cancelled"] },
    paymentStatus: { $in: ["paid", "cod", "refunded"] },
  }).sort({ createdAt: -1 }).select("customer").lean();
  const { name, phone, address, pincode, landmark } = previous?.customer || {};
  if (!name || !phone || !address || !pincode) return null;
  return { name, phone, address, pincode, landmark };
}

function deliveryLines(customer) {
  return [
    `Name: ${customer.name}`, `Phone: ${customer.phone}`, `Address: ${customer.address}`,
    `PIN: ${customer.pincode}`, customer.landmark && `Landmark: ${customer.landmark}`,
    customer.message && `Delivery note: ${customer.message}`,
  ].filter(Boolean).join("\n");
}

async function previewCheckout({ account, conversation, patch }) {
  const parsed = orderPatchSchema.safeParse(patch);
  if (!parsed.success) return reply("Order details clear nahi hain. Product, quantity aur delivery details dobara bhejein.");
  const prior = conversation.checkout || {};
  if (prior.orderId || prior.token) {
    const existing = await Order.findOne({ whatsappConversation: conversation._id,
      ...(prior.orderId ? { orderId: prior.orderId } : { checkoutKey: `${conversation._id}:${prior.token}` }) });
    if (existing && existing.orderStatus !== "cancelled" && !["paid", "cod", "refunded"].includes(existing.paymentStatus)) {
      return orderReply(existing, prior.token);
    }
  }
  const base = prior.orderId ? {} : prior;
  const saved = !base.items?.length && parsed.data.items?.length ? await savedDelivery(conversation.customerWaId) : null;
  const draft = {
    ...base, ...parsed.data,
    customer: { ...saved, ...base.customer, ...parsed.data.customer, whatsappNumber: conversation.customerWaId },
    confirmDelivery: Boolean(saved || base.confirmDelivery),
    token: crypto.randomBytes(12).toString("hex"), updatedAt: Date.now(),
    quoteHash: null,
  };
  await saveDraft(conversation, draft);
  const missing = ["name", "phone", "address", "pincode"].filter((key) => !draft.customer[key]);
  if (!draft.items?.length) missing.unshift("product aur quantity (variant ho toh woh bhi)");
  if (missing.length) return reply(`Order ke liye bhejein: ${missing.join(", ")}. Landmark aur delivery message optional hain. Abhi order confirm nahi hua hai.`);
  try {
    const { sanitizeCustomer, buildOrderQuote } = require("../controllers/orderController");
    const customer = sanitizeCustomer(draft.customer);
    if (draft.confirmDelivery) {
      return reply(`*Saved delivery details*\n\n${deliveryLines(customer)}\n\nConfirm delivery tap karein, ya sirf changed details bhejein.`, [
        button("Confirm delivery", "delivery", draft.token), button("Cancel draft", "cancel", draft.token),
      ]);
    }
    const quote = await buildOrderQuote(draft.items, draft.couponCode);
    if (!Number.isFinite(quote.total) || quote.total < 1) throw new Error("Order total kam se kam Rs. 1 hona chahiye.");
    draft.customer = customer;
    draft.quoteHash = fingerprint(quote);
    await saveDraft(conversation, draft);
    const settings = await WhatsAppAISettings.findOne({ account: account._id }).lean();
    const buttons = [button("Pay online", "online", draft.token)];
    if (settings?.codEnabled === true) buttons.push(button("Confirm COD", "cod", draft.token));
    buttons.push(button("Cancel draft", "cancel", draft.token));
    // Keep the interactive body small; long summaries are sent as a separate text message.
    const items = quote.items.map((i) => `• ${i.productName}${i.variantSummary ? ` (${i.variantSummary})` : ""}\n  Qty ${i.quantity} · ${money(i.discountedLineTotal)}`);
    const totals = [
      `Subtotal: ${money(quote.subtotal)}`, `Discount: ${money(quote.discountTotal)}`,
      ...quote.additionalCharges.map((c) => `${c.name}: ${money(c.amount)}`), `*Total: ${money(quote.total)}*`,
    ];
    return reply([
      ["*Order review*", "Payment ke baad order confirm hoga."].join("\n"),
      ["*Products*", items.join("\n\n")].join("\n"),
      ["*Payment summary*", ...totals].join("\n"),
      ["*Delivery details*", deliveryLines(customer)].join("\n"),
      "Details sahi hain toh Pay online tap karein ya CONFIRM bhejein. Correction yahin bhej sakte hain.",
      settings?.codEnabled ? "COD choose karne ke liye Confirm COD tap karein." : "",
    ].filter(Boolean).join("\n\n"), buttons);
  } catch (error) {
    return reply(`Order abhi confirm nahi hua. ${error.statusCode && error.statusCode < 500 ? error.message : "Details, stock ya pricing verify nahi ho payi. Details check karke dobara bhejein."}`);
  }
}

function orderReply(order, token) {
  if (order.orderStatus === "cancelled") return reply(`Unpaid order ${order.orderId} cancel ho gaya. Naye order ki product aur delivery details bhejein.`);
  if (order.paymentStatus === "cod") return reply(`*Order confirmed — Cash on Delivery*\nOrder ID: ${order.orderId}\nDelivery par ${money(order.total)} pay karein.`);
  if (["paid", "refunded"].includes(order.paymentStatus)) return reply(`Order ID: ${order.orderId}\nPayment: ${order.paymentStatus}\nOrder status: ${order.orderStatus}\nTotal: ${money(order.total)}`);
  if (order.paymentLinkExpiresAt && new Date(order.paymentLinkExpiresAt) <= new Date()) return reply(`Order ${order.orderId} ka payment link expire ho gaya. Order confirm nahi hua. Cancel unpaid tap karke naya order shuru kar sakte hain.`, [button("Cancel unpaid", "cancel", token)]);
  return { ...reply(`Order ${order.orderId} *payment ka wait kar raha hai; confirm nahi hua*.\nTotal: ${money(order.total)}\n${order.paymentLinkUrl ? "WhatsApp payment card ke Review and Pay button se payment karein. Payment verify hone par confirmation milega." : "Payment request abhi taiyar nahi hua. Check payment button se retry karein."}`,
    token ? [button("Check payment", "status", token), button("Cancel unpaid", "cancel", token)] : []),
    ...(order.paymentLinkUrl ? { paymentRequestOrderId: order.orderId } : {}) };
}

function validLinkPayment(order, link, payment) {
  return Boolean(order && order.source === "whatsapp" && order.paymentMethod === "online"
    && link?.id === order.razorpayPaymentLinkId && link.reference_id === order.orderId
    && link.status === "paid" && link.currency === "INR"
    && Number(link.amount) === Math.round(order.total * 100) && Number(link.amount_paid) === Number(link.amount)
    && payment?.id && payment.status === "captured" && payment.currency === "INR"
    && Number(payment.amount) === Number(link.amount)
    && link.order_id && payment.order_id === link.order_id);
}

async function confirmLinkPayment(order, link, payment) {
  if (!validLinkPayment(order, link, payment)) return false;
  const now = new Date();
  const updated = await Order.findOneAndUpdate({
    _id: order._id, razorpayPaymentLinkId: link.id,
    paymentStatus: { $in: ["pending", "failed"] }, orderStatus: "awaiting_payment",
  }, { $set: { paymentStatus: "paid", orderStatus: "confirmed", razorpayPaymentId: payment.id,
    razorpayOrderId: payment.order_id, paidAt: now, statusUpdatedAt: now,
    invoiceWhatsAppNextAttemptAt: now } }, { new: true });
  if (updated) enqueueOrderPaidNotification(updated);
  return Boolean(updated);
}

async function ensurePaymentLink(order) {
  if (order.razorpayPaymentLinkId) return order;
  // Recover a provider success followed by a timeout / process restart before creating again.
  const found = await findPaymentLinks(order.orderId);
  const existing = (found.payment_links || []).find((link) => link.reference_id === order.orderId);
  const link = existing || await createPaymentLink({ amount: Math.round(order.total * 100), referenceId: order.orderId, customer: order.customer });
  if (!link.id || !link.short_url || link.reference_id !== order.orderId
    || Number(link.amount) !== Math.round(order.total * 100) || link.currency !== "INR") {
    throw new Error("Invalid payment link response");
  }
  order.razorpayPaymentLinkId = link.id;
  order.paymentLinkUrl = link.short_url;
  order.paymentLinkExpiresAt = link.expire_by ? new Date(link.expire_by * 1000) : undefined;
  await order.save();
  return order;
}

async function handleCheckoutButton({ account, conversation, buttonReplyId }) {
  if (!String(buttonReplyId || "").startsWith("checkout:")) return null;
  const [, action, token] = buttonReplyId.split(":");
  const draft = conversation.checkout;
  if (!draft || token !== draft.token) return reply("Yeh purana order button hai. Current order details dobara bhejein.");
  let order = await Order.findOne({ checkoutKey: `${conversation._id}:${token}` });
  if (order) {
    if (order.orderStatus === "cancelled") return orderReply(order, token);
    if (order.razorpayOrderId && ["pending", "failed"].includes(order.paymentStatus)) {
      return reply(`Order ${order.orderId} ka payment website par resume hua hai. Status ya payment ke liye View all orders kholein: https://prakashshop.in/orders`);
    }
    if (order.paymentMethod === "online" && !["paid", "refunded"].includes(order.paymentStatus)) {
      try {
        await ensurePaymentLink(order);
        const link = await getPaymentLink(order.razorpayPaymentLinkId);
        if (link.status === "paid" && link.payments?.length) {
          const payment = await getRazorpayPayment(link.payments[0].payment_id);
          await confirmLinkPayment(order, link, payment);
          order = await Order.findById(order._id);
        }
        if (action === "cancel" && ["created", "expired", "cancelled"].includes(link.status) && Number(link.amount_paid || 0) === 0) {
          const closed = link.status === "created" ? await cancelPaymentLink(link.id) : link;
          if (!["cancelled", "expired"].includes(closed.status)) throw new Error("Payment link could not be closed");
          const cancelled = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: { $in: ["pending", "failed"] }, orderStatus: "awaiting_payment" },
            { $set: { orderStatus: "cancelled", statusUpdatedAt: new Date() } }, { new: true });
          if (cancelled) {
            await saveDraft(conversation, null);
            return orderReply(cancelled, token);
          }
          order = await Order.findById(order._id);
        }
      } catch (_error) { return reply("Payment provider abhi verify nahi ho paya. Order ko paid confirm nahi kiya gaya. Thodi der baad Check payment dobara tap karein.", [button("Check payment", "status", token)]); }
    }
    return orderReply(order, token);
  }
  if (action === "cancel") {
    await saveDraft(conversation, null);
    return reply("Order draft cancel kar diya. Koi order confirm nahi hua.");
  }
  if (draft.confirmDelivery && Date.now() - draft.updatedAt <= 30 * 60 * 1000) {
    if (action !== "delivery") return reply("Pehle Confirm delivery tap karke delivery details verify karein.", [button("Confirm delivery", "delivery", token)]);
    await saveDraft(conversation, { ...draft, confirmDelivery: false });
    return previewCheckout({ account, conversation, patch: {} });
  }
  if (!["online", "cod"].includes(action) || !draft.quoteHash || Date.now() - draft.updatedAt > 30 * 60 * 1000) {
    return reply("Order review expire ho gaya. Product aur details dobara bhejein taaki latest total check ho sake.");
  }
  const settings = await WhatsAppAISettings.findOne({ account: account._id }).lean();
  if (action === "cod" && settings?.codEnabled !== true) return reply("Abhi COD service available nahi hai. Online payment choose karein.", [button("Pay online", "online", token)]);
  const { sanitizeCustomer, buildOrderQuote, newPublicOrderId } = require("../controllers/orderController");
  try {
    const customer = sanitizeCustomer(draft.customer);
    const quote = await buildOrderQuote(draft.items, draft.couponCode);
    if (fingerprint(quote) !== draft.quoteHash) return previewCheckout({ account, conversation, patch: {} });
    await require("./whatsappCheckoutIndexes").ensureWhatsAppCheckoutIndexes();
    if (action === "online") {
      const env = require("../config/env");
      if (!env.metaCatalog.catalogId || quote.items.some((item) => !item.retailerId)) {
        return reply("In products ki WhatsApp catalog listing abhi available nahi hai. Shop team se contact karein.");
      }
      if (!env.razorpay.webhookSecret || !env.razorpay.keyId || !env.razorpay.keySecret) return reply("Online payments abhi available nahi hain. Shop team se contact karein; order confirm nahi hua.");
      try {
        await require("./whatsappPaymentRequestService").getPaymentTemplate({ account, settings });
      } catch (_error) {
        return reply("WhatsApp Pay now service abhi available nahi hai. Shop team se contact karein; order confirm nahi hua.");
      }
    }
    try {
      order = await Order.create({ ...quote, customer, orderId: newPublicOrderId(),
        itemCount: quote.items.reduce((sum, i) => sum + i.quantity, 0),
        source: "whatsapp", whatsappAccount: account._id, whatsappConversation: conversation._id,
        checkoutKey: `${conversation._id}:${token}`, paymentMethod: action,
        paymentStatus: action === "cod" ? "cod" : "pending", orderStatus: action === "cod" ? "confirmed" : "awaiting_payment",
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      order = await Order.findOne({ checkoutKey: `${conversation._id}:${token}` });
      if (!order) throw error;
    }
    await saveDraft(conversation, { ...draft, orderId: order.orderId });
    if (order.paymentMethod === "cod") enqueueOrderPaidNotification(order);
    else await ensurePaymentLink(order);
    return orderReply(order, token);
  } catch (error) {
    return reply(`Order paid confirm nahi hua. ${error.statusCode && error.statusCode < 500 ? error.message : "Order process nahi ho paya. Thodi der baad retry karein."}`, [button("Check payment", "status", token)]);
  }
}

async function handlePaymentLinkWebhook(event) {
  if (event.event !== "payment_link.paid") return;
  const link = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  if (!link?.id || !link.reference_id) return;
  const order = await Order.findOne({ orderId: link.reference_id, source: "whatsapp", paymentMethod: "online" });
  if (!order) return;
  // Payment could arrive immediately after provider creation but before the link ID is saved.
  if (!order.razorpayPaymentLinkId) {
    const verifiedLink = await getPaymentLink(link.id);
    if (verifiedLink.reference_id !== order.orderId || Number(verifiedLink.amount) !== Math.round(order.total * 100)) return;
    order.razorpayPaymentLinkId = verifiedLink.id;
    order.paymentLinkUrl = verifiedLink.short_url;
    await order.save();
  }
  await confirmLinkPayment(order, link, payment);
}

async function resumeHostedPayment(order) {
  await ensurePaymentLink(order);
  const link = await getPaymentLink(order.razorpayPaymentLinkId);
  if (link.id !== order.razorpayPaymentLinkId || link.reference_id !== order.orderId || Number(link.amount) !== Math.round(order.total * 100) || link.currency !== "INR") {
    throw new AppError("This payment link could not be verified.", 409);
  }
  if (link.status === "paid" && link.payments?.length) {
    const payment = await getRazorpayPayment(link.payments[0].payment_id);
    await confirmLinkPayment(order, link, payment);
    const current = await Order.findById(order._id);
    return { order: current, processing: current.paymentStatus !== "paid" };
  }
  if (["expired", "cancelled"].includes(link.status) && Number(link.amount_paid || 0) === 0) return { order, expired: true };
  if (link.status !== "created") return { order, processing: true };
  const url = new URL(link.short_url);
  if (url.protocol !== "https:" || url.username || url.password || !["rzp.io", "rzpy.in", "razorpay.me"].includes(url.hostname)) {
    throw new AppError("This payment link could not be verified.", 409);
  }
  return { order, paymentUrl: url.href };
}

module.exports = { previewCheckout, handleCheckoutButton, handlePaymentLinkWebhook, validLinkPayment, confirmLinkPayment, orderPatchSchema, fingerprint, resumeHostedPayment };
