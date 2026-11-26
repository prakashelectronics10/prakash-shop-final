const test = require("node:test");
const assert = require("node:assert/strict");
process.env.RAZORPAY_KEY_ID = "rzp_live_unit_test_only";
const records = [];
require("../services/whatsappConversationService").recordMessage = async (args) => records.push(args);
const { validatePaymentTemplate, paymentTemplateComponents, getPaymentTemplate, sendPaymentRequest } = require("../services/whatsappPaymentRequestService");

const template = {
  name: "pulse_order_payment", status: "APPROVED", language: "en", category: "UTILITY",
  components: [
    { type: "BODY", text: "Hi {{1}}, pay for order {{2}}. Amount INR {{3}}." },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Pay now", url: "https://rzp.io/rzp/{{1}}" }] },
  ],
};

test("payment request uses an approved headerless template with one dynamic Razorpay button", () => {
  const config = validatePaymentTemplate(template);
  const components = paymentTemplateComponents({ paymentLinkUrl: "https://rzp.io/rzp/abc123", orderId: "PEORDER", total: 300, customer: { name: "Customer" } }, config);
  assert.deepEqual(components[0].parameters.map((p) => p.text), ["Customer", "PEORDER", "300.00"]);
  assert.deepEqual(components[1], { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "abc123" }] });
});

test("incompatible or unapproved templates cannot masquerade as a payment card", () => {
  for (const change of [{ status: "PENDING" }, { status: "PAUSED" }, { category: "MARKETING" },
    { components: [...template.components, { type: "HEADER", format: "IMAGE" }] },
    { components: [template.components[0], { type: "BUTTONS", buttons: [{ type: "URL", url: "https://example.com/{{1}}" }] }] },
    { components: [{ type: "BODY", text: "Pay {{1}}" }, template.components[1]] }]) {
    assert.throws(() => validatePaymentTemplate({ ...template, ...change }));
  }
});

test("dynamic suffix cannot swap the payment domain or mismatch the approved prefix", () => {
  const config = validatePaymentTemplate(template);
  for (const url of ["https://rzp.io/i/abc", "https://evil.test/pay", "https://rzp.io/rzp/../other", "https://rzp.io/rzp/abc?redirect=evil"]) {
    assert.throws(() => paymentTemplateComponents({ paymentLinkUrl: url, total: 300, customer: {} }, config));
  }
});

test("missing account activation blocks payment templates before API access", async () => {
  await assert.rejects(getPaymentTemplate({ account: {}, settings: { enhancedPaymentsEnabled: false } }), /activated/);
});

test("order card uses the approved template ID, language and declared customer parameter", async (t) => {
  const { orderDetailsComponents } = require("../services/whatsappPaymentRequestService");
  const approved = { name: "order_details_with_product_list", status: "APPROVED", language: "en_IN",
    components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi {{customer_name}}" },
      { type: "BUTTONS", buttons: [{ type: "ORDER_DETAILS" }] }] };
  t.mock.method(global, "fetch", async (url) => {
    assert.match(new URL(url).pathname, /\/1468551722067479$/);
    return Response.json(approved);
  });
  const args = { account: { accessToken: "test" }, settings: { enhancedPaymentsEnabled: true } };
  const order = { orderId: "PE123", items: [], customer: { name: "Rahul", address: "Main Road" },
    subtotal: 0, total: 0, paymentLinkUrl: "https://rzp.io/i/abc" };
  const config = await getPaymentTemplate(args);
  assert.equal(config.language, "en_IN");
  assert.deepEqual(orderDetailsComponents(order, config)[1].parameters,
    [{ type: "text", text: "Rahul", parameter_name: "customer_name" }]);
  approved.components[1].text = "Review your order below";
  const components = orderDetailsComponents(order, await getPaymentTemplate(args));
  assert.deepEqual(components.map((component) => component.type), ["header", "button"]);
});

test("payment request sends a template, records its ID, and reuses the sent card on retries", async (t) => {
  const Order = require("../models/Order");
  const Settings = require("../models/WhatsAppAISettings");
  const order = { _id: "66b000000000000000000001", orderId: "PEORDER", paymentStatus: "pending", orderStatus: "awaiting_payment",
    total: 300, customer: { name: "Customer" }, paymentLinkUrl: "https://rzp.io/rzp/abc123", paymentRequestMessageId: "" };
  t.mock.method(Order, "findOne", async () => order);
  t.mock.method(Order, "findOneAndUpdate", async () => order);
  t.mock.method(Order, "updateOne", async (_filter, update) => Object.assign(order, update.$set || {}));
  t.mock.method(Settings, "findOne", () => ({ lean: async () => ({ enhancedPaymentsEnabled: true }) }));
  let messagesSent = 0;
  t.mock.method(global, "fetch", async (url, opts) => {
    if (String(url).includes("message_templates")) return Response.json({ data: [template] });
    const body = JSON.parse(opts.body);
    assert.equal(body.type, "template");
    assert.equal(body.template.name, "pulse_order_payment");
    assert.equal(body.template.components[1].parameters[0].text, "abc123");
    messagesSent++;
    return Response.json({ messages: [{ id: "wamid.payment-card" }] });
  });
  const args = { account: { _id: "account", businessAccountId: "waba", phoneNumberId: "123", accessToken: "test" }, conversation: { _id: "conversation", customerWaId: "919876543210" }, orderId: "PEORDER" };
  await sendPaymentRequest(args);
  assert.equal((await sendPaymentRequest(args)).reused, true);
  assert.equal(messagesSent, 1);
  assert.equal(order.paymentRequestMessageId, "wamid.payment-card");
  assert.equal(records.at(-1).meta.kind, "payment_request");
});

test("order details template carries the catalog variant, product image and exact INR totals", () => {
  const { orderDetailsComponents } = require("../services/whatsappPaymentRequestService");
  const components = orderDetailsComponents({
    orderId: "PE0123", customer: { name: "Rahul", address: "Main Road", pincode: "825101" },
    paymentLinkUrl: "https://rzp.io/rzp/abc", total: 210.5, subtotal: 200.5, discountTotal: 10,
    additionalCharges: [{ name: "Delivery", amount: 20 }],
    items: [{ productName: "Fan", variantSummary: "Blue", retailerId: "FAN-BLUE",
      productImageUrl: "https://shop.test/blue.jpg", unitPrice: 100.25, quantity: 2 }],
  });
  assert.equal(components[0].parameters[0].image.link, "https://shop.test/blue.jpg");
  assert.equal(components[1].parameters[0].text, "Rahul");
  assert.equal(components[2].sub_type, "order_details");
  const details = components[2].parameters[0].action.order_details;
  assert.equal(details.order.items[0].retailer_id, "FAN-BLUE");
  assert.equal(details.order.items[0].amount.value * details.order.items[0].quantity, details.order.subtotal.value);
  assert.equal(details.total_amount.value, details.order.subtotal.value + details.order.shipping.value - details.order.discount.value);
  assert.equal(details.payment_settings[0].payment_link.uri, "https://rzp.io/rzp/abc");
});
