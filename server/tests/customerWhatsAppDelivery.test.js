const test = require("node:test");
const assert = require("node:assert/strict");
const Otp = require("../models/CustomerWhatsAppOtp");
const Receipt = require("../models/WhatsAppDeliveryReceipt");
const { recordDeliveryReceipts } = require("../services/whatsappDeliveryService");

test("signed delivery data can be associated after an early webhook and cannot downgrade a delivered code", async (t) => {
  const stored = new Map();
  t.mock.method(Receipt, "updateOne", async (query, update, options) => {
    const current = stored.get(query._id);
    if (current && current.rank >= query.rank.$lt) {
      if (options?.upsert) throw Object.assign(new Error("duplicate"), { code: 11000 });
      return { modifiedCount: 0 };
    }
    stored.set(query._id, { ...current, ...update.$set });
    return { modifiedCount: 1 };
  });
  const event = (status) => ({
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "1234" }, statuses: [{ id: "wamid.test", status }],
    } }] }],
  });
  await recordDeliveryReceipts(event("delivered"));
  await recordDeliveryReceipts(event("sent"));
  assert.equal(stored.get("1234:wamid.test").status, "delivered");
  assert.ok(stored.get("1234:wamid.test").expiresAt instanceof Date);

  const { getCustomerOtpDelivery } = require("../services/customerWhatsAppOtpService");
  const id = "a".repeat(24);
  t.mock.method(Otp, "findOne", (query) => {
    assert.deepEqual(query, { _id: id, purpose: "order-history", whatsappNumber: "9000000001" });
    return { select: () => ({ lean: async () => ({ deliveryReceiptId: "1234:wamid.test", expiresAt: new Date(Date.now() + 5000) }) }) };
  });
  t.mock.method(Receipt, "findById", (key) => ({ select: () => ({ lean: async () => stored.get(key) }) }));
  assert.equal(await getCustomerOtpDelivery({ challengeId: id, purpose: "order-history", whatsappNumber: "9000000001" }), "delivered");
});

test("development rejects a Meta send failure instead of returning a successful challenge", async (t) => {
  const sender = require("../services/whatsappTransactionalService");
  // Load a fresh service to bind the mocked transport in this test.
  const servicePath = require.resolve("../services/customerWhatsAppOtpService");
  const previous = require.cache[servicePath];
  delete require.cache[servicePath];
  t.after(() => { require.cache[servicePath] = previous; });
  let sendError = { status: 400 };
  t.mock.method(sender, "sendOtpWhatsApp", async () => { throw Object.assign(new Error("Meta error"), sendError); });
  t.mock.method(Otp, "hashOtp", async () => "fake-hash");
  t.mock.method(Otp, "updateMany", async () => {});
  const remove = t.mock.fn(async () => {});
  t.mock.method(Otp, "create", async () => ({ _id: "a".repeat(24), deleteOne: remove }));
  const { sendCustomerWhatsAppOtp } = require(servicePath);
  await assert.rejects(sendCustomerWhatsAppOtp({ whatsappNumber: "9000000001", purpose: "order-history" }), {
    statusCode: 502, message: "WhatsApp could not confirm sending the code. Please try again.",
  });
  assert.equal(remove.mock.callCount(), 1);
  sendError = { status: 503, code: 141006 };
  await assert.rejects(sendCustomerWhatsAppOtp({ whatsappNumber: "9000000001", purpose: "order-history" }), {
    statusCode: 503, message: "WhatsApp verification is temporarily unavailable. Please contact the shop.",
  });
  assert.equal(remove.mock.callCount(), 2);
});

test("OTP preflight recognizes a Meta billing restriction and caches the result briefly", async (t) => {
  const { hasWhatsAppBillingBlock } = require("../services/whatsappCloudApiService");
  const check = t.mock.method(global, "fetch", async (url, options) => {
    assert.match(url, /\/1234\?fields=health_status$/);
    assert.equal(options.method, "GET");
    return Response.json({ health_status: { entities: [
      { entity_type: "WABA", can_send_message: "BLOCKED", errors: [{ error_code: 141006 }] },
    ] } });
  });
  const account = { businessAccountId: "1234", accessToken: "test-key" };
  assert.equal(await hasWhatsAppBillingBlock(account), true);
  assert.equal(await hasWhatsAppBillingBlock(account), true);
  assert.equal(check.mock.callCount(), 1);
});
