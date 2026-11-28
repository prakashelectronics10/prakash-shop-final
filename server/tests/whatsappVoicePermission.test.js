const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createPermissionService } = require("../services/whatsappVoicePermissionService");

const customerWaId = "919876543210";
const account = { _id: "account", businessAccountId: "business", phoneNumberId: "phone" };
const conversation = { _id: "conversation" };
const requestId = "wamid.permission";

function fixture({ callable = true, outboundEnabled = true } = {}) {
  let state;
  const events = [];
  const service = createPermissionService({
    config: { ...account, enabled: true, outboundEnabled, accessToken: "fake" },
    calling: { configurationReady: () => true, getSettings: async () => ({ enabled: true }),
      ensureIndexes: async () => {}, startOutbound: async (phone) => { events.push(["dial", phone]); return true; } },
    conversations: { async updateOne(filter, { $set }) {
      assert.equal(filter.account, account._id);
      assert.equal(filter.customerWaId, customerWaId);
      const expected = filter["voicePermission.status"];
      if (typeof expected === "string" && state?.status !== expected) return { modifiedCount: 0 };
      if (expected?.$exists === false && state) return { modifiedCount: 0 };
      if (filter["voicePermission.messageId"] && filter["voicePermission.messageId"] !== state?.messageId) return { modifiedCount: 0 };
      state = $set.voicePermission || { ...state, status: $set["voicePermission.status"] };
      return { modifiedCount: 1 };
    } },
    graph: async ({ path, businessAccountId }) => {
      if (path === "call_permissions") return { permission: { status: callable ? "temporary" : "no_permission" }, actions: [
        { action_name: "send_call_permission_request", can_perform_action: true },
        { action_name: "start_call", can_perform_action: callable },
      ] };
      assert.equal(businessAccountId, "1646212583946864");
      return { id: businessAccountId, name: "call_request_to_customer", language: "en_US", status: "APPROVED",
        components: [{ type: "CALL_PERMISSION_REQUEST" }] };
    },
    send: async (options) => { events.push(["template", options.templateName, options.languageCode]); return { messages: [{ id: requestId }] }; },
    record: async (message) => assert.equal(message.waMessageId, requestId),
  });
  const send = () => service.sendAfterGreeting({ account, conversation, customerWaId });
  const reply = (data = {}, contextId = requestId) => service.prepareReply({ account,
    event: { customerWaId, raw: { context: { id: contextId }, timestamp: Math.floor(Date.now() / 1000),
      interactive: { type: "call_permission_reply", call_permission_reply: {
        response: "accept", response_source: "user_action", is_permanent: false,
        expiration_timestamp: Math.floor(Date.now() / 1000) + 600, ...data,
      } } } },
  });
  return { events, send, reply };
}

test("permission template and explicit accepted webhook allow one outbound call", async () => {
  const flow = fixture();
  await Promise.all([flow.send(), flow.send()]);
  assert.deepEqual(flow.events, [["template", "call_request_to_customer", "en_US"]]);
  assert.equal(await flow.reply({ response_source: "automatic" }), undefined);
  assert.equal(await flow.reply({}, "wamid.unrelated"), undefined);
  assert.equal(await flow.reply({ expiration_timestamp: 1 }), undefined);
  const work = await Promise.all([flow.reply(), flow.reply()]);
  assert.equal(work.filter(Boolean).length, 1);
  await work.find(Boolean)();
  assert.deepEqual(flow.events.at(-1), ["dial", customerWaId]);
});

test("decline, revoked permission, or disabled outbound calling do not dial", async () => {
  const declined = fixture();
  await declined.send();
  assert.equal(await declined.reply({ response: "reject" }), undefined);
  assert.equal(await declined.reply(), undefined);
  const revoked = fixture({ callable: false });
  await revoked.send();
  await (await revoked.reply())();
  assert.equal(revoked.events.length, 1);
  const disabled = fixture({ outboundEnabled: false });
  await disabled.send();
  assert.equal(disabled.events.length, 0);
});
