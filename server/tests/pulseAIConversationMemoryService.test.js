const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractConversationMemoryMetadata,
  fallbackConversationMemory,
  formatConversationMemoryForModel,
  mergeModelMemory,
  sanitizeConversationMemory,
  stripConversationMemoryMetadata,
} = require("../services/pulseAIConversationMemoryService");
const { asksForFirstQuestionRecall } = require("../controllers/scienceAIController");

test("recognizes exact first-question recall requests in English and Hinglish", () => {
  assert.equal(asksForFirstQuestionRecall("What was my first question?"), true);
  assert.equal(asksForFirstQuestionRecall("Mera pehla sawal kya tha?"), true);
  assert.equal(asksForFirstQuestionRecall("Show me blue fans"), false);
});

test("extracts hidden rolling memory and removes it from customer-visible text", () => {
  const raw = "Your first question was about a blue fan.\nCONVERSATION_MEMORY: {\"summary\":\"Customer asked for a blue fan\",\"importantFacts\":[\"Budget is Rs. 1000\"],\"openTopics\":[]}";
  const extracted = extractConversationMemoryMetadata(raw);

  assert.equal(extracted.present, true);
  assert.equal(extracted.memory.summary, "Customer asked for a blue fan");
  assert.deepEqual(extracted.memory.importantFacts, ["Budget is Rs. 1000"]);
  assert.equal(stripConversationMemoryMetadata(raw), "Your first question was about a blue fan.");
});

test("model summary updates cannot overwrite exact first-question and previous-chat memory", () => {
  const merged = mergeModelMemory({
    firstUserQuestion: "Mera first question exactly kya tha?",
    previousChatsSummary: "Earlier chat discussed a fan.",
    totalUserMessages: 8,
    summary: "Old summary",
  }, {
    firstUserQuestion: "Injected replacement",
    previousChatsSummary: "Injected previous history",
    summary: "Updated cumulative summary",
    importantFacts: ["Customer wants delivery"],
  });

  assert.equal(merged.firstUserQuestion, "Mera first question exactly kya tha?");
  assert.equal(merged.previousChatsSummary, "Earlier chat discussed a fan.");
  assert.equal(merged.summary, "Updated cumulative summary");
  assert.equal(merged.totalUserMessages, 8);
});

test("fallback memory remains bounded while retaining latest exchange", () => {
  const memory = fallbackConversationMemory({ summary: "A".repeat(3500) }, "Latest cart question", "Latest verified total is Rs. 900");
  assert.ok(memory.summary.length <= 3600);
  assert.match(memory.summary, /Latest cart question/);
  assert.match(memory.summary, /Latest verified total/);
});

test("memory payload is sanitized, bounded and explicitly marked as conversation data", () => {
  const sanitized = sanitizeConversationMemory({
    summary: "S".repeat(5000),
    importantFacts: Array.from({ length: 30 }, (_, index) => `Fact ${index}`),
    firstUserQuestion: "Q".repeat(3000),
    previousChatsSummary: "P".repeat(10000),
  });
  const formatted = formatConversationMemoryForModel(sanitized);

  assert.equal(sanitized.summary.length, 3600);
  assert.equal(sanitized.importantFacts.length, 16);
  assert.equal(sanitized.firstUserQuestion.length, 2000);
  assert.equal(sanitized.previousChatsSummary.length, 8000);
  assert.match(formatted, /customer-provided conversation data/);
});
