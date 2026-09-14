const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractChatTitleMetadata,
  fallbackChatTitle,
  sanitizeChatTitle,
  stripChatTitleMetadata,
} = require("../services/pulseAIChatTitleService");

test("extracts and removes the AI-generated chat title metadata", () => {
  const response = 'Here is the answer.\nCHAT_TITLE: "Bluetooth Speaker Recommendations"\nCONVERSATION_MEMORY: {}';
  assert.equal(extractChatTitleMetadata(response), "Bluetooth Speaker Recommendations");
  assert.equal(stripChatTitleMetadata(response), "Here is the answer.\nCONVERSATION_MEMORY: {}");
});

test("sanitizes formatting and limits long model titles", () => {
  assert.equal(sanitizeChatTitle('**AC Repair & Service Help!**'), "AC Repair & Service Help");
  assert.ok(sanitizeChatTitle("A very long generated conversation title that should never overflow the compact header area").length <= 60);
});

test("fallback titles describe intent without copying the customer prompt", () => {
  assert.equal(fallbackChatTitle("my ac has a repair issue"), "Repair Service Assistance");
  assert.equal(fallbackChatTitle("", true), "Product Image Analysis");
});
