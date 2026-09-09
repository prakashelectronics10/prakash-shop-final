const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCustomerKey,
  canonicalDemandKey,
  customerMadeDemand,
  demandAlertDecision,
  detectUnavailableDemands,
  exactCatalogMatchExists,
  extractUnavailableDemandMetadata,
  isBusinessRelevantDemand,
  safeImageInputs,
  stripUnavailableDemandMetadata,
} = require("../services/pulseAIUnavailableDemandService");
const { renderPulseAIUnavailableDemandEmail } = require("../services/email/templates/pulseAIUnavailableDemandTemplate");
const { buildMimeMessage } = require("../services/email/smtpClient");
const Admin = require("../models/Admin");
const NotificationEmail = require("../models/NotificationEmail");
const PulseAIUnavailableDemandSettings = require("../models/PulseAIUnavailableDemandSettings");
const { pulseAIUnavailableDemandSettingsSchema } = require("../validations/adminSchemas");

const unavailableLine = 'UNAVAILABLE_DEMAND: [{"requestedItem":"BLDC fan with remote","type":"product","reason":"Not available in the active catalog"}]';

function event(customerKey, at, firstDetectedAt = at) {
  return { customerKey, firstDetectedAt, latestDetectedAt: at, query: `Query from ${customerKey}` };
}

test("recipient and aggregated-demand settings have safe defaults", () => {
  const admin = new Admin({ email: "alerts-admin@example.com", passwordHash: "test-hash" });
  const manual = new NotificationEmail({ email: "extra@example.com", source: "manual" });
  const settings = new PulseAIUnavailableDemandSettings();
  assert.equal(admin.receivePulseAIUnavailableAlerts, true);
  assert.equal(manual.receivePulseAIUnavailableAlerts, false);
  assert.equal(settings.minimumUniqueCustomers, 7);
  assert.equal(settings.trackingPeriodHours, 168);
  assert.equal(admin.validateSync(), undefined);
  assert.equal(manual.validateSync(), undefined);
  assert.equal(settings.validateSync(), undefined);
});

test("admin demand settings accept only supported thresholds and rolling periods", () => {
  assert.equal(pulseAIUnavailableDemandSettingsSchema.safeParse({
    minimumUniqueCustomers: 7,
    trackingPeriodHours: 24,
  }).success, true);
  assert.equal(pulseAIUnavailableDemandSettingsSchema.safeParse({
    minimumUniqueCustomers: 1,
    trackingPeriodHours: 48,
  }).success, false);
});

test("parses and strips unavailable-demand machine metadata", () => {
  const response = `BLDC fan with remote catalog mein available nahi hai.\n${unavailableLine}`;
  const parsed = extractUnavailableDemandMetadata(response);
  assert.equal(parsed.present, true);
  assert.equal(parsed.items[0].requestedItem, "BLDC fan with remote");
  assert.equal(parsed.items[0].type, "product");
  assert.equal(stripUnavailableDemandMetadata(response), "BLDC fan with remote catalog mein available nahi hai.");
});

test("electrical/electronics unavailable demand is eligible for aggregation", () => {
  const response = `BLDC fan with remote catalog mein available nahi hai.\n${unavailableLine}`;
  const demands = detectUnavailableDemands({
    customerMessage: "Remote wala BLDC fan chahiye",
    aiText: response,
    catalogProducts: [{ name: "Havells Standard Ceiling Fan", category: "Cooling" }],
  });
  assert.equal(demands.length, 1);
  assert.equal(demands[0].requestedItem, "BLDC fan with remote");
});

test("unrelated shampoo, shoes, firecrackers, cosmetics and food demands are ignored", () => {
  for (const requestedItem of ["shampoo", "running shoes", "firecrackers", "cosmetics", "packaged food"]) {
    assert.equal(isBusinessRelevantDemand({ requestedItem, type: "product" }, `I want ${requestedItem}`), false);
    const response = `This item is not available.\nUNAVAILABLE_DEMAND: [{"requestedItem":"${requestedItem}","type":"product","reason":"Not available"}]`;
    assert.deepEqual(detectUnavailableDemands({ customerMessage: `Do you have ${requestedItem}?`, aiText: response }), []);
  }
});

test("general knowledge questions do not generate demand records", () => {
  const response = `A BLDC fan uses an efficient motor and is not available in our catalog.\n${unavailableLine}`;
  assert.equal(customerMadeDemand("What is a BLDC fan?"), false);
  assert.deepEqual(detectUnavailableDemands({ customerMessage: "What is a BLDC fan?", aiText: response }), []);
});

test("an exact active catalog product prevents false unavailable demand", () => {
  const response = 'That product is not available.\nUNAVAILABLE_DEMAND: [{"requestedItem":"Havells Ceiling Fan","type":"product","reason":"Not available"}]';
  assert.equal(exactCatalogMatchExists("Havells Ceiling Fan", [
    { name: "Havells Ceiling Fan", category: "Cooling" },
  ]), true);
  assert.deepEqual(detectUnavailableDemands({
    customerMessage: "Havells ceiling fan available hai?",
    aiText: response,
    catalogProducts: [{ name: "Havells Ceiling Fan", category: "Cooling" }],
  }), []);
});

test("an existing service prevents a false service-demand record", () => {
  const response = 'That service is unavailable.\nUNAVAILABLE_DEMAND: [{"requestedItem":"AC Repair","type":"service","reason":"Not available"}]';
  assert.deepEqual(detectUnavailableDemands({
    customerMessage: "AC repair service chahiye",
    aiText: response,
    services: [{ title: "AC Repair", categoryName: "Repair Services" }],
  }), []);
});

test("semantically equivalent demand wording produces one aggregation key", () => {
  const first = canonicalDemandKey({ requestedItem: "BLDC fan with remote", type: "product" });
  const second = canonicalDemandKey({ requestedItem: "remote controlled BLDC fans", type: "product" });
  assert.equal(first, second);
});

test("stable customer hashing deduplicates the same customer without storing raw identity", () => {
  const first = buildCustomerKey({ customerId: "customer-123" });
  const repeat = buildCustomerKey({ customerId: "customer-123", sessionId: "different-chat" });
  const other = buildCustomerKey({ customerId: "customer-456" });
  assert.equal(first, repeat);
  assert.notEqual(first, other);
  assert.equal(first.length, 64);
  assert.equal(first.includes("customer-123"), false);
});

test("single query never alerts and seven unique customers reach the configured threshold", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  const one = demandAlertDecision({
    events: [event("one", now)],
    minimumUniqueCustomers: 7,
    trackingPeriodHours: 24,
    now,
  });
  assert.equal(one.shouldAlert, false);
  assert.equal(one.uniqueCustomerCount, 1);

  const seven = demandAlertDecision({
    events: Array.from({ length: 7 }, (_value, index) => event(`customer-${index}`, now)),
    minimumUniqueCustomers: 7,
    trackingPeriodHours: 24,
    now,
  });
  assert.equal(seven.shouldAlert, true);
  assert.equal(seven.uniqueCustomerCount, 7);
});

test("repeat messages from one customer count once and expired events leave the rolling window", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  const result = demandAlertDecision({
    events: [
      event("same", now),
      event("same", new Date("2026-09-08T11:00:00.000Z")),
      event("expired", new Date("2026-09-06T11:00:00.000Z")),
    ],
    minimumUniqueCustomers: 2,
    trackingPeriodHours: 24,
    now,
  });
  assert.equal(result.uniqueCustomerCount, 1);
  assert.equal(result.shouldAlert, false);
});

test("cooldown and a new full threshold cohort prevent duplicate threshold emails", () => {
  const lastAlertAt = new Date("2026-09-07T12:00:00.000Z");
  const now = new Date("2026-09-08T13:00:00.000Z");
  const prior = Array.from({ length: 7 }, (_value, index) => event(`prior-${index}`, now, new Date("2026-09-07T10:00:00.000Z")));
  const insufficientNew = demandAlertDecision({
    events: [...prior, event("new-one", now, now)],
    lastAlertAt,
    minimumUniqueCustomers: 7,
    trackingPeriodHours: 168,
    now,
  });
  assert.equal(insufficientNew.shouldAlert, false);
  assert.equal(insufficientNew.reason, "already_alerted");

  const fullNewCohort = demandAlertDecision({
    events: [...prior, ...Array.from({ length: 7 }, (_value, index) => event(`new-${index}`, now, now))],
    lastAlertAt,
    minimumUniqueCustomers: 7,
    trackingPeriodHours: 168,
    now,
  });
  assert.equal(fullNewCohort.shouldAlert, true);
  assert.equal(fullNewCohort.reason, "new_threshold_cohort");
});

test("image-only electrical spare requests are supported and unsafe image payloads are rejected", () => {
  const image = { mimeType: "image/png", base64: Buffer.from("valid-image-bytes").toString("base64"), name: "request.png" };
  assert.equal(safeImageInputs([image]).length, 1);
  assert.equal(safeImageInputs([{ mimeType: "text/html", base64: image.base64 }]).length, 0);
  const response = 'This photographed part is not available.\nUNAVAILABLE_DEMAND: [{"requestedItem":"Ceiling fan capacitor","type":"product","reason":"No exact active catalog match"}]';
  assert.equal(detectUnavailableDemands({ customerMessage: "", aiText: response, hasImages: true }).length, 1);
});

test("aggregated professional email escapes content and shows counts, period, examples and images", () => {
  const template = renderPulseAIUnavailableDemandEmail({
    requestedItem: "BLDC fan <script>",
    demandType: "product",
    reason: "Not in catalog",
    uniqueCustomerCount: 7,
    trackingPeriodHours: 168,
    recentExamples: [{ query: '<img src=x onerror="bad">', detectedAt: "2026-09-08T10:00:00.000Z" }],
    firstDetectedAt: "2026-09-07T10:00:00.000Z",
    latestDetectedAt: "2026-09-08T10:00:00.000Z",
    images: [{ name: "photo.png", url: "https://res.cloudinary.com/demo/image/upload/photo.png" }],
    model: "gemini-3.5-flash",
  });
  assert.match(template.subject, /BLDC fan/);
  assert.match(template.subject, /7 customers/);
  assert.doesNotMatch(template.html, /<script>/);
  assert.doesNotMatch(template.html, /<img src=x/);
  assert.match(template.html, /Unique customers\/users/);
  assert.match(template.html, /7 days/);
  assert.match(template.html, /Recent example customer queries/);
  assert.match(template.html, /Relevant customer uploads/);
  assert.match(template.html, /res\.cloudinary\.com/);
});

test("SMTP fallback generates a real MIME attachment for uploaded images", () => {
  const mime = buildMimeMessage({
    from: "Prakash Electronics <alerts@prakashshop.in>",
    to: "admin@example.com",
    subject: "Unavailable demand",
    text: "Image attached",
    html: "<p>Image attached</p>",
    attachments: [{ filename: "customer-upload.png", contentType: "image/png", content: Buffer.from("image-bytes") }],
  });
  assert.match(mime.raw, /Content-Type: multipart\/mixed/);
  assert.match(mime.raw, /Content-Type: image\/png/);
  assert.match(mime.raw, /filename="customer-upload\.png"/);
  assert.match(mime.raw, /aW1hZ2UtYnl0ZXM=/);
});
