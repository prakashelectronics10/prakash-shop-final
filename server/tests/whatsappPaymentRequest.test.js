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
