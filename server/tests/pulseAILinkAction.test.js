const test = require("node:test");
const assert = require("node:assert/strict");
const PulseAIInstruction = require("../models/PulseAIInstruction");
const { pulseAIInstructionSchema } = require("../validations/adminSchemas");
const {
  extractRequestedActionIds,
  isProductDetailUrl,
  resolveLinkType,
  resolveVerifiedLinkCards,
  scoreLinkActionRelevance,
  stripLinkActionMetadata,
  validateLinkAction,
} = require("../services/pulseAILinkActionService");

function linkInstruction(overrides = {}) {
  return {
    _id: overrides._id || "warranty-action",
    title: overrides.title || "Havells warranty guidance",
    instruction: overrides.instruction || "Guide customers to official warranty registration.",
    target: overrides.target || "Havells fan warranty",
    priority: overrides.priority ?? 100,
    isActive: overrides.isActive ?? true,
    linkAction: {
      enabled: true,
      title: "Havells Warranty Registration",
      description: "Register or review warranty details using the official portal.",
      url: "https://example.com/havells/warranty",
      type: "external",
      trigger: "Customer specifically asks about registering or checking Havells fan warranty.",
      ctaLabel: "Register Warranty",
      openInNewTab: true,
      ...overrides.linkAction,
    },
  };
}

test("matching Hinglish warranty intent returns the configured link action", () => {
  const instruction = linkInstruction();
  const cards = resolveVerifiedLinkCards({
    promptText: "Mera Havells fan ka warranty register kaise hoga?",
    instructions: [instruction],
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, "warranty-action");
  assert.equal(cards[0].ctaLabel, "Register Warranty");
});

test("an unrelated Havells shopping prompt does not expose the warranty action", () => {
  const result = scoreLinkActionRelevance("₹2000 ke andar Havells fan suggest karo", linkInstruction());
  assert.equal(result.relevant, false);
  assert.deepEqual(resolveVerifiedLinkCards({
    promptText: "₹2000 ke andar Havells fan suggest karo",
    instructions: [linkInstruction()],
  }), []);
});

test("a brand-specific warranty action is not exposed for a generic warranty question", () => {
  assert.deepEqual(resolveVerifiedLinkCards({
    promptText: "Warranty registration ka link do",
    instructions: [linkInstruction()],
  }), []);
});

test("a disabled instruction cannot return its action", () => {
  const cards = resolveVerifiedLinkCards({
    promptText: "Havells fan warranty register karna hai",
    instructions: [linkInstruction({ isActive: false })],
  });
  assert.deepEqual(cards, []);
});

test("a disabled link action cannot return a card", () => {
  const cards = resolveVerifiedLinkCards({
    promptText: "Havells fan warranty register karna hai",
    instructions: [linkInstruction({ linkAction: { enabled: false } })],
  });
  assert.deepEqual(cards, []);
});

test("the response uses the exact admin-configured URL", () => {
  const exactUrl = "https://example.com/havells/warranty?source=admin%20panel#register";
  const cards = resolveVerifiedLinkCards({
    promptText: "Havells fan warranty registration",
    instructions: [linkInstruction({ linkAction: { url: exactUrl } })],
    aiText: 'Helpful reply\nLINK_ACTION_IDS: ["warranty-action"]',
  });
  assert.equal(cards[0].url, exactUrl);
});

test("model-provided URLs cannot substitute the server-owned destination", () => {
  const configuredUrl = "https://example.com/havells/warranty";
  const cards = resolveVerifiedLinkCards({
    promptText: "Havells fan warranty registration",
    instructions: [linkInstruction({ linkAction: { url: configuredUrl } })],
    aiText: 'Use https://evil.invalid/replacement\nLINK_ACTION_IDS: ["warranty-action"]',
  });
  assert.equal(cards[0].url, configuredUrl);
  assert.notEqual(cards[0].url, "https://evil.invalid/replacement");
});

test("unknown action IDs are discarded without semantic fallback", () => {
  const cards = resolveVerifiedLinkCards({
    promptText: "Havells fan warranty registration",
    instructions: [linkInstruction()],
    aiText: 'LINK_ACTION_IDS: ["unknown-action"]',
  });
  assert.deepEqual(cards, []);
});

test("external HTTPS URL is identified correctly", () => {
  assert.equal(resolveLinkType({ type: "auto", url: "https://support.havells.com/register" }), "external");
  assert.deepEqual(
    validateLinkAction({ enabled: true, title: "Support", trigger: "Customer asks for support", type: "external", url: "https://support.havells.com" }).valid,
    true,
  );
});

test("internal website route and same-domain URL are identified correctly", () => {
  assert.equal(resolveLinkType({ type: "auto", url: "/privacy-policy" }), "internal");
  assert.equal(resolveLinkType({ type: "auto", url: "https://prakashshop.in/contact" }), "internal");
  assert.equal(validateLinkAction({ enabled: true, title: "Privacy", trigger: "Privacy policy", type: "internal", url: "/privacy-policy" }).valid, true);
});

test("unsafe and malformed protocols are rejected", () => {
  const base = { enabled: true, title: "Unsafe", trigger: "Unsafe test", type: "auto" };
  assert.equal(validateLinkAction({ ...base, url: "javascript:alert(1)" }).valid, false);
  assert.equal(validateLinkAction({ ...base, url: "data:text/html,bad" }).valid, false);
  assert.equal(validateLinkAction({ ...base, url: "http://example.com" }).valid, false);
  assert.equal(validateLinkAction({ ...base, url: "not a URL" }).valid, false);
});

test("admin payload validation returns a useful URL error", () => {
  const result = pulseAIInstructionSchema.safeParse({
    title: "Unsafe action test",
    instruction: "Never accept unsafe action URLs.",
    linkAction: {
      enabled: true,
      title: "Unsafe URL",
      trigger: "A customer requests this unsafe link",
      url: "javascript:alert(1)",
    },
  });
  assert.equal(result.success, false);
  assert.match(result.error.flatten().fieldErrors.linkAction[0], /internal route|HTTPS URL/i);
});

test("multiple relevant actions rank by relevance then priority and are limited to three", () => {
  const makeSupport = (id, priority, trigger) => linkInstruction({
    _id: id,
    title: `Support ${id}`,
    priority,
    target: "",
    linkAction: {
      title: "Customer Support",
      trigger,
      url: `https://example.com/${id}`,
      ctaLabel: "Contact Support",
    },
  });
  const cards = resolveVerifiedLinkCards({
    promptText: "Customer support aur help desk ke contact links do",
    instructions: [
      makeSupport("low", 10, "Show for customer support"),
      makeSupport("high", 900, "Show for customer support"),
      makeSupport("middle", 500, "Show for customer support"),
      makeSupport("fourth", 1, "Show for customer support"),
    ],
    maxCards: 10,
  });
  assert.deepEqual(cards.map((card) => card.id), ["high", "middle", "low"]);
});

test("existing instructions without linkAction remain valid and return no card", () => {
  const legacy = new PulseAIInstruction({
    title: "Legacy response rule",
    instruction: "Keep answers short and professional.",
  });
  assert.equal(legacy.validateSync(), undefined);
  assert.deepEqual(resolveVerifiedLinkCards({ promptText: "hello", instructions: [legacy.toObject()] }), []);
});

test("machine action IDs parse cleanly and are removed from customer prose", () => {
  const response = 'Helpful answer.\nLINK_ACTION_IDS: ["warranty-action","support-action"]';
  assert.deepEqual(extractRequestedActionIds(response), {
    present: true,
    ids: ["warranty-action", "support-action"],
  });
  assert.equal(stripLinkActionMetadata(response), "Helpful answer.");
});

test("product detail URLs are rejected because products belong in suggestion cards", () => {
  assert.equal(isProductDetailUrl("/product-detail/bldc-fan"), true);
  assert.equal(isProductDetailUrl("/product/bldc-fan"), true);
  assert.equal(isProductDetailUrl("https://prakashshop.in/product-detail/bldc-fan"), true);
  const instruction = linkInstruction({
    linkAction: {
      url: "/product-detail/bldc-fan",
      type: "internal",
      trigger: "Show BLDC fan product",
    },
  });
  assert.equal(validateLinkAction(instruction.linkAction).valid, false);
  assert.deepEqual(resolveVerifiedLinkCards({
    promptText: "BLDC fan product dikhao",
    instructions: [instruction],
  }), []);
});
