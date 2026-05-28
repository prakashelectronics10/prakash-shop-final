export const invoiceTemplates = [
  { value: "minimal", label: "Minimal Professional" },
  { value: "glass", label: "Glassmorphism Style" },
  { value: "modern-blue", label: "Modern Blue Theme" },
  { value: "dark", label: "Dark Theme" },
  { value: "corporate", label: "Corporate Theme" },
];

export const invoiceThemePresets = [
  {
    name: "Neon Blue",
    primaryColor: "#2563eb",
    accentColor: "#38bdf8",
    buttonColor: "#1d4ed8",
    headerColor: "#020617",
    textColor: "#0f172a",
    backgroundColor: "#ffffff",
  },
  {
    name: "Emerald",
    primaryColor: "#059669",
    accentColor: "#5eead4",
    buttonColor: "#047857",
    headerColor: "#052e2b",
    textColor: "#10201d",
    backgroundColor: "#f8fffd",
  },
  {
    name: "Ruby",
    primaryColor: "#e11d48",
    accentColor: "#fb7185",
    buttonColor: "#be123c",
    headerColor: "#3f0713",
    textColor: "#1f1115",
    backgroundColor: "#fff8fa",
  },
  {
    name: "Gold",
    primaryColor: "#ca8a04",
    accentColor: "#facc15",
    buttonColor: "#a16207",
    headerColor: "#241a05",
    textColor: "#1f1a10",
    backgroundColor: "#fffdf5",
  },
  {
    name: "Violet",
    primaryColor: "#7c3aed",
    accentColor: "#c084fc",
    buttonColor: "#6d28d9",
    headerColor: "#160f2e",
    textColor: "#151124",
    backgroundColor: "#fbf8ff",
  },
];

export function todayInputDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function defaultInvoiceForm(invoiceNumber = "Auto generated") {
  const preset = invoiceThemePresets[0];
  return {
    invoiceNumber,
    invoiceDate: todayInputDate(),
    dueDate: todayInputDate(7),
    paymentStatus: "pending",
    business: {
      name: "Prakash Electronics",
      logoUrl: "",
      logoPublicId: "",
      address: "Chitarpur, Ramgarh, Jharkhand",
      gstNumber: "",
      contactNumber: "",
      email: "prakash@example.com",
      websiteUrl: "https://www.prakashshop.in",
    },
    customer: {
      name: "",
      phone: "",
      email: "",
      address: "",
      customerId: "",
    },
    items: [emptyInvoiceItem()],
    template: "modern-blue",
    theme: { ...preset },
    notes: "Thank you for your business.",
    signatureLabel: "Authorised Signature",
  };
}

export function emptyInvoiceItem() {
  return {
    name: "",
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    taxRate: 18,
    totalPrice: 0,
  };
}

export function toMoneyNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(0, parsed) * 100) / 100;
}

export function calculateInvoiceTotals(items = []) {
  const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
    const quantity = toMoneyNumber(item.quantity || 0);
    const unitPrice = toMoneyNumber(item.unitPrice || 0);
    const gross = toMoneyNumber(quantity * unitPrice);
    const discount = Math.min(toMoneyNumber(item.discount || 0), gross);
    const taxRate = Math.min(100, toMoneyNumber(item.taxRate || 0));
    const taxable = Math.max(0, gross - discount);
    const taxAmount = toMoneyNumber((taxable * taxRate) / 100);
    return {
      ...item,
      quantity,
      unitPrice,
      discount,
      taxRate,
      totalPrice: toMoneyNumber(taxable + taxAmount),
    };
  });

  return normalizedItems.reduce(
    (acc, item) => {
      const gross = toMoneyNumber(item.quantity * item.unitPrice);
      acc.subtotal = toMoneyNumber(acc.subtotal + gross);
      acc.discountTotal = toMoneyNumber(acc.discountTotal + item.discount);
      acc.taxTotal = toMoneyNumber(acc.taxTotal + Math.max(0, item.totalPrice - Math.max(0, gross - item.discount)));
      acc.grandTotal = toMoneyNumber(acc.grandTotal + item.totalPrice);
      return acc;
    },
    { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 },
  );
}

export function formatCurrency(value) {
  return toMoneyNumber(value).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

export function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function displayInvoiceStatus(invoice) {
  const status = invoice?.status || invoice?.paymentStatus || "pending";
  if (status === "paid") return "paid";
  const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null;
  if (dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < new Date()) return "overdue";
  return status;
}

export function invoiceToForm(invoice) {
  if (!invoice) return defaultInvoiceForm();
  const form = defaultInvoiceForm(invoice.invoiceNumber);
  return {
    ...form,
    ...invoice,
    invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().slice(0, 10) : form.invoiceDate,
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : form.dueDate,
    business: { ...form.business, ...(invoice.business || {}) },
    customer: { ...form.customer, ...(invoice.customer || {}) },
    theme: { ...form.theme, ...(invoice.theme || {}) },
    items: (invoice.items?.length ? invoice.items : form.items).map((item) => ({ ...emptyInvoiceItem(), ...item })),
  };
}

export function formToInvoicePayload(form) {
  const totals = calculateInvoiceTotals(form.items);
  return {
    invoiceNumber: form.invoiceNumber && !String(form.invoiceNumber).toLowerCase().includes("auto") ? form.invoiceNumber : "",
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate,
    paymentStatus: form.paymentStatus,
    business: form.business,
    customer: form.customer,
    items: form.items.map((item) => ({
      name: item.name,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      discount: Number(item.discount || 0),
      taxRate: Number(item.taxRate || 0),
    })),
    template: form.template,
    theme: form.theme,
    notes: form.notes,
    signatureLabel: form.signatureLabel,
    totals,
  };
}

export function invoicePrintHtml(invoice) {
  const totals = invoice.totals || calculateInvoiceTotals(invoice.items);
  const theme = invoice.theme || invoiceThemePresets[0];
  const rows = (invoice.items || [])
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unitPrice)}</td>
          <td>${formatCurrency(item.discount)}</td>
          <td>${item.taxRate}%</td>
          <td>${formatCurrency(item.totalPrice)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(invoice.invoiceNumber || "Invoice")}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #f8fafc; }
        .page { max-width: 860px; margin: 0 auto; padding: 34px; background: ${theme.backgroundColor || "#fff"}; min-height: 100vh; }
        .header { display: flex; justify-content: space-between; gap: 24px; padding: 28px; color: white; background: ${theme.headerColor}; border-radius: 18px; border-bottom: 6px solid ${theme.primaryColor}; }
        .brand { display: flex; gap: 14px; align-items: flex-start; }
        .logo { width: 58px; height: 58px; border-radius: 16px; object-fit: cover; background: white; }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: 32px; letter-spacing: 0; }
        .muted { color: #64748b; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 28px 0; }
        .panel { padding: 18px; border: 1px solid #dbeafe; border-radius: 16px; background: #ffffff; }
        .panel h3 { color: ${theme.primaryColor}; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { color: #475569; background: #eff6ff; text-align: left; }
        th, td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
        .totals { width: 330px; margin-left: auto; margin-top: 24px; border: 1px solid #dbeafe; border-radius: 16px; overflow: hidden; }
        .total-row { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
        .grand { background: ${theme.primaryColor}; color: white; font-weight: 900; font-size: 18px; }
        .footer { display: flex; justify-content: space-between; gap: 28px; margin-top: 58px; align-items: flex-end; }
        .signature { width: 220px; text-align: center; border-top: 1px solid #94a3b8; padding-top: 12px; }
        @media print { body { background: white; } .page { padding: 0; } }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="header">
          <div class="brand">
            ${invoice.business?.logoUrl ? `<img class="logo" src="${escapeHtml(invoice.business.logoUrl)}" alt="" />` : ""}
            <div>
              <h2>${escapeHtml(invoice.business?.name || "")}</h2>
              <p>${escapeHtml(invoice.business?.address || "")}</p>
              <p>${escapeHtml(invoice.business?.contactNumber || "")} ${escapeHtml(invoice.business?.email || "")}</p>
            </div>
          </div>
          <div>
            <h1>INVOICE</h1>
            <p>${escapeHtml(invoice.invoiceNumber || "")}</p>
            <p>${formatDate(invoice.invoiceDate)} - Due ${formatDate(invoice.dueDate)}</p>
          </div>
        </section>
        <section class="grid">
          <div class="panel">
            <h3>Bill To</h3>
            <p><strong>${escapeHtml(invoice.customer?.name || "")}</strong></p>
            <p>${escapeHtml(invoice.customer?.address || "")}</p>
            <p>${escapeHtml(invoice.customer?.phone || "")} ${escapeHtml(invoice.customer?.email || "")}</p>
          </div>
          <div class="panel">
            <h3>Payment</h3>
            <p>Status: <strong>${escapeHtml(displayInvoiceStatus(invoice).toUpperCase())}</strong></p>
            <p>GST: ${escapeHtml(invoice.business?.gstNumber || "N/A")}</p>
            <p>Customer ID: ${escapeHtml(invoice.customer?.customerId || "N/A")}</p>
          </div>
        </section>
        <table>
          <thead>
            <tr><th>#</th><th>Item</th><th>Qty</th><th>Unit</th><th>Discount</th><th>Tax</th><th>Total</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <section class="totals">
          <div class="total-row"><span>Subtotal</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
          <div class="total-row"><span>Discount</span><strong>-${formatCurrency(totals.discountTotal)}</strong></div>
          <div class="total-row"><span>Tax</span><strong>${formatCurrency(totals.taxTotal)}</strong></div>
          <div class="total-row grand"><span>Grand Total</span><strong>${formatCurrency(totals.grandTotal)}</strong></div>
        </section>
        <section class="footer">
          <p class="muted">${escapeHtml(invoice.notes || "Thank you for your business.")}</p>
          <p class="signature">${escapeHtml(invoice.signatureLabel || "Authorised Signature")}</p>
        </section>
      </main>
    </body>
  </html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
