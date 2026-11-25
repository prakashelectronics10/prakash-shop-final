const assert = require("node:assert/strict");
const test = require("node:test");
const sharp = require("sharp");
const env = require("../config/env");
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const WhatsAppConversation = require("../models/WhatsAppConversation");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const { downloadPublicOrderInvoice } = require("../controllers/orderController");
const { sendOrderInvoiceWhatsApp } = require("../services/whatsappTransactionalService");
const { getOrderInvoicePdf } = require("../services/orderInvoiceService");

test("checkout and WhatsApp use the same branded PDF, sent to the entered WhatsApp number", async (t) => {
  const signature = await sharp({
    create: { width: 32, height: 12, channels: 3, background: "#112477" },
  }).png().toBuffer();
  const invoice = new Invoice({
    orderId: "PE-PDF-TEST",
    invoiceNumber: "INV-PDF-TEST",
    paymentStatus: "paid",
    signatureUrl: "https://images.example.test/signature.png",
    items: [{ name: "Test item", quantity: 1, unitPrice: 100, totalPrice: 100 }],
    totals: { subtotal: 100, grandTotal: 100 },
  });
  const order = {
    orderId: invoice.orderId,
    paymentStatus: "paid",
    customer: { name: "Example", phone: "9000000001", whatsappNumber: "9000000002" },
  };
  const originalEnabled = env.whatsapp.enabled;
  const originalTemplate = env.whatsapp.templates.orderInvoice;
  const originalLanguage = env.whatsapp.templates.orderInvoiceLanguage;
  t.after(() => {
    env.whatsapp.enabled = originalEnabled;
    env.whatsapp.templates.orderInvoice = originalTemplate;
    env.whatsapp.templates.orderInvoiceLanguage = originalLanguage;
  });
  env.whatsapp.enabled = true;
  env.whatsapp.templates.orderInvoice = "purchase_receipt_3";
  env.whatsapp.templates.orderInvoiceLanguage = "en_US";

  let savedPdf;
  let saves = 0;
  const messages = [];
  const uploads = [];
  let templateStatus = "PENDING";
  t.mock.method(Order, "findOne", async () => order);
  t.mock.method(Invoice, "findOne", async () => invoice);
  t.mock.method(Invoice, "findById", () => ({ select: async () => ({ checkoutPdf: savedPdf }) }));
  t.mock.method(Invoice, "findOneAndUpdate", (filter, update) => ({
    select: async () => {
      assert.deepEqual(filter.checkoutPdf, { $exists: false });
      if (savedPdf) return null;
      saves += 1;
      savedPdf = update.$set.checkoutPdf;
      return { checkoutPdf: savedPdf };
    },
  }));
  t.mock.method(WhatsAppAccount, "findOne", () => ({
    sort: async () => ({ _id: "account", businessAccountId: "test-waba", phoneNumberId: "test-sender", accessToken: "test-token" }),
  }));
  const conversation = { _id: "conversation", async save() {} };
  t.mock.method(WhatsAppConversation, "findOneAndUpdate", async (filter) => {
    assert.equal(filter.customerWaId, "919000000002");
    return conversation;
  });
  t.mock.method(WhatsAppConversation, "findById", async () => conversation);
  t.mock.method(WhatsAppMessage, "findOne", () => ({ lean: async () => null }));
  t.mock.method(WhatsAppMessage, "create", async (data) => ({ ...data, _id: "message" }));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === invoice.signatureUrl) return new Response(signature);
    if (url.includes("/test-waba/message_templates?")) {
      assert.equal(options.method, "GET");
      assert.equal(new URL(url).searchParams.get("name"), "purchase_receipt_3");
      return Response.json({ data: [
        { name: "purchase_receipt_3", language: "en", status: "APPROVED" },
        { name: "purchase_receipt_3", language: "en_US", status: templateStatus },
      ] });
    }
    if (url.endsWith("/test-sender/media")) {
      const file = options.body.get("file");
      assert.equal(file.type, "application/pdf");
      assert.equal(file.name, "INV-PDF-TEST.pdf");
      assert.equal(options.headers["Content-Type"], undefined);
      uploads.push(Buffer.from(await file.arrayBuffer()));
      return Response.json({ id: "test-media-id" });
    }
    assert.match(url, /\/test-sender\/messages$/);
    messages.push(JSON.parse(options.body));
    return Response.json({ messages: [{ id: "wamid.test" }] });
  });

  assert.deepEqual(await sendOrderInvoiceWhatsApp({ order, invoice }), {
    ok: false, reason: "template_unavailable", templateStatus: "PENDING",
  });
  assert.equal(uploads.length, 0);
  assert.equal(messages.length, 0);
  templateStatus = "APPROVED";

  const headers = {};
  const checkout = new Promise((resolve, reject) => {
    downloadPublicOrderInvoice(
      { params: { orderId: order.orderId }, query: { theme: "blue" } },
      { setHeader: (key, value) => { headers[key] = value; }, send: resolve },
      reject,
    );
  });
  const [downloaded] = await Promise.all([checkout, sendOrderInvoiceWhatsApp({ order, invoice })]);
  assert.equal(saves, 1);
  assert.equal(headers["Content-Type"], "application/pdf");
  assert.equal(headers["Content-Disposition"], 'attachment; filename="INV-PDF-TEST.pdf"');
  assert.deepEqual(uploads[0], downloaded);
  assert.match(downloaded.toString("latin1"), /\/ImLogo Do/);
  assert.match(downloaded.toString("latin1"), /\/ImSignature Do/);
  assert.equal(messages[0].to, "919000000002");
  assert.deepEqual(messages[0].template.components[0].parameters[0].document, {
    id: "test-media-id", filename: "INV-PDF-TEST.pdf",
  });
  assert.equal(messages[0].template.name, "purchase_receipt_3");
  assert.equal(messages[0].template.language.code, "en_US");
  assert.deepEqual(messages[0].template.components.slice(1), [
    { type: "body", parameters: [{ type: "text", text: "Example" }, { type: "text", text: order.orderId }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: order.orderId }] },
  ]);
  const skipped = await sendOrderInvoiceWhatsApp({ order: { ...order, customer: { phone: order.customer.phone } }, invoice });
  assert.equal(skipped.reason, "whatsapp_number_missing");
  assert.equal(messages.length, 1);
});

test("checkout does not save an invoice with a missing configured signature", async (t) => {
  const invoice = new Invoice({ invoiceNumber: "INV-MISSING-SIGNATURE", signatureUrl: "https://images.example.test/missing.png" });
  t.mock.method(Invoice, "findById", () => ({ select: async () => ({}) }));
  const write = t.mock.method(Invoice, "findOneAndUpdate", () => { throw new Error("Unexpected write"); });
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  await assert.rejects(() => getOrderInvoicePdf(invoice), /configured signature could not be embedded/);
  assert.equal(write.mock.callCount(), 0);
});
