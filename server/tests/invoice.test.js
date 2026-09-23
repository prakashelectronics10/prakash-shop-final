const assert = require("node:assert/strict");
const test = require("node:test");

const { generateInvoicePdf } = require("../services/invoicePdfService");
const { calculateInvoiceTotals } = require("../utils/invoiceTotals");
const { invoiceSchema, invoiceUpdateSchema } = require("../validations/invoiceSchemas");

function invoiceFixture(overrides = {}) {
  const items = overrides.items || [
    { name: "Premium copper wire coil with long professional description", quantity: 2, unitPrice: 1450, discount: 100, taxRate: 18 },
  ];
  const calculated = calculateInvoiceTotals(items);
  return {
    invoiceNumber: "INV-2026-0001",
    invoiceDate: new Date("2026-09-17T00:00:00.000Z"),
    dueDate: new Date("2026-09-24T00:00:00.000Z"),
    paymentStatus: "pending",
    business: {
      name: "Prakash Electronics",
      logoUrl: "",
      logoPublicId: "",
      address: "Main Road, Chitarpur, Ramgarh, Jharkhand 825101",
      gstNumber: "20ABCDE1234F1Z5",
      contactNumber: "+91 98765 43210",
      email: "support@prakashshop.in",
      websiteUrl: "https://www.prakashshop.in",
    },
    customer: {
      name: "Aarav Sharma",
      phone: "+91 91234 56789",
      email: "aarav@example.com",
      address: "A long customer address that should wrap cleanly without covering adjacent invoice details",
      customerId: "CUS-1042",
    },
    items: calculated.items,
    totals: calculated.totals,
    template: "minimal",
    theme: {
      primaryColor: "#2563eb",
      accentColor: "#38bdf8",
      buttonColor: "#1d4ed8",
      headerColor: "#020617",
      textColor: "#0f172a",
      backgroundColor: "#ffffff",
    },
    notes: "Goods once sold will be covered by the applicable manufacturer warranty. Please retain this invoice for service support.",
    signatureLabel: "Authorised Signature",
    ...overrides,
  };
}

test("invoice validation rejects invalid dates and excessive item discounts", () => {
  const fixture = invoiceFixture();
  const parsed = invoiceSchema.safeParse({
    ...fixture,
    invoiceDate: "2026-09-17",
    dueDate: "2026-09-16",
    items: [{ name: "Wire", quantity: 1, unitPrice: 100, discount: 101, taxRate: 18 }],
  });

  assert.equal(parsed.success, false);
  const issues = parsed.error.issues.map((issue) => issue.message);
  assert.ok(issues.includes("Due date cannot be before invoice date"));
  assert.ok(issues.includes("Discount cannot exceed the item price"));
});

test("invoice patch validation accepts safe partial updates", () => {
  const parsed = invoiceUpdateSchema.safeParse({
    notes: "Updated payment terms",
    business: { gstNumber: "20ABCDE1234F1Z5" },
  });
  assert.equal(parsed.success, true);
});

test("invoice PDF paginates dense invoices and emits a valid PDF", async () => {
  const items = Array.from({ length: 9 }, (_, index) => ({
    name: `Professional electrical item ${index + 1} with a descriptive model name`,
    quantity: index + 1,
    unitPrice: 725.5 + index * 100,
    discount: index * 5,
    taxRate: 18,
  }));
  const calculated = calculateInvoiceTotals(items);
  const pdf = await generateInvoicePdf(invoiceFixture({ items: calculated.items, totals: calculated.totals }));

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /\/Count 2\b/);
  assert.ok(pdf.length > 4000);
});
