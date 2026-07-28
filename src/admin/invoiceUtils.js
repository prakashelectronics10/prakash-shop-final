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
  return `Rs. ${toMoneyNumber(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
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
  const template = invoice.template || "modern-blue";
  const primary = theme.primaryColor || "#2563eb";
  const accent = theme.accentColor || "#38bdf8";
  const header = theme.headerColor || "#020617";
  const text = theme.textColor || "#0f172a";
  const background = theme.backgroundColor || "#ffffff";
  const rows = (invoice.items || [])
    .map(
      (item, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${item.quantity}</td>
          <td class="right">${formatCurrency(item.unitPrice)}</td>
          <td class="right">${formatCurrency(item.discount)}</td>
          <td class="right">${item.taxRate}%</td>
          <td class="right amount">${formatCurrency(item.totalPrice)}</td>
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
        body {
          margin: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: ${text};
          background: #eef2f7;
        }
        .page {
          --primary: ${primary};
          --accent: ${accent};
          --header: ${header};
          --text: ${text};
          --bg: ${background};
          max-width: 860px;
          margin: 24px auto;
          padding: 0 0 28px;
          background: var(--bg);
          min-height: 100vh;
          overflow: hidden;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
        }
        .page.dark { color: #e2e8f0; }
        .topbar {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          padding: 28px 32px 24px;
          color: #fff;
          background: var(--header);
          border-bottom: 4px solid var(--primary);
        }
        .page.minimal .topbar {
          background: transparent;
          color: var(--text);
          border-bottom: 2px solid var(--primary);
          padding-top: 36px;
        }
        .page.minimal .topbar .muted { color: #64748b; }
        .page.glass .topbar {
          margin: 16px 16px 0;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--primary) 35%, white);
          border-bottom: 4px solid var(--accent);
        }
        .page.corporate .topbar { border-left: 8px solid var(--primary); }
        .brand { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
        .logo { width: 56px; height: 56px; border-radius: 12px; object-fit: cover; background: #fff; flex: 0 0 auto; }
        .logo-fallback {
          width: 56px; height: 56px; border-radius: 12px; background: #fff; color: var(--primary);
          display: grid; place-items: center; font-weight: 800; flex: 0 0 auto;
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: 28px; letter-spacing: 0.04em; text-align: right; }
        .title-block { text-align: right; }
        .title-block p { margin-top: 6px; font-size: 13px; }
        .muted { color: rgba(255,255,255,0.78); font-size: 12px; line-height: 1.45; }
        .page.minimal .muted { color: #64748b; }
        .content { padding: 0 32px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
        .panel {
          padding: 16px 18px;
          border: 1px solid color-mix(in srgb, var(--primary) 22%, #cbd5e1);
          border-radius: 12px;
          background: color-mix(in srgb, var(--primary) 5%, var(--bg));
        }
        .panel h3 {
          color: var(--primary);
          margin-bottom: 10px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .panel p { font-size: 13px; line-height: 1.45; margin-top: 4px; }
        .meta-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 13px; }
        .meta-row span { color: #64748b; }
        .page.dark .meta-row span { color: #94a3b8; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; border: 1px solid color-mix(in srgb, var(--primary) 20%, #cbd5e1); }
        th {
          color: #475569;
          background: color-mix(in srgb, var(--primary) 12%, #f8fafc);
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .page.dark th { color: #cbd5e1; background: color-mix(in srgb, var(--primary) 28%, #0f172a); }
        th, td { padding: 11px 10px; border-bottom: 1px solid color-mix(in srgb, var(--primary) 14%, #e2e8f0); font-size: 13px; vertical-align: top; }
        th.right, td.right { text-align: right; white-space: nowrap; }
        th.num, td.num { width: 36px; text-align: left; color: #64748b; }
        td.amount { font-weight: 700; }
        tbody tr:nth-child(even) { background: color-mix(in srgb, var(--primary) 4%, transparent); }
        .totals {
          width: 300px;
          margin-left: auto;
          margin-top: 20px;
          border: 1px solid color-mix(in srgb, var(--primary) 22%, #cbd5e1);
          border-radius: 12px;
          overflow: hidden;
        }
        .total-row { display: flex; justify-content: space-between; gap: 16px; padding: 11px 14px; border-bottom: 1px solid color-mix(in srgb, var(--primary) 12%, #e2e8f0); font-size: 13px; }
        .total-row strong { white-space: nowrap; text-align: right; }
        .grand { background: var(--primary); color: #fff; font-weight: 800; font-size: 15px; border-bottom: 0; }
        .footer { display: flex; justify-content: space-between; gap: 28px; margin-top: 48px; align-items: flex-end; }
        .footer .note-label { color: var(--primary); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
        .signature { width: 220px; text-align: center; border-top: 1px solid #94a3b8; padding-top: 10px; font-size: 12px; color: #64748b; }
        .page-foot {
          margin-top: 28px;
          padding-top: 12px;
          border-top: 1px solid color-mix(in srgb, var(--primary) 16%, #e2e8f0);
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
        }
        .accent-bar { height: 6px; background: var(--accent); margin-top: 24px; }
        .page.minimal .accent-bar { background: var(--primary); height: 4px; }
        @media print {
          body { background: white; }
          .page { margin: 0; box-shadow: none; max-width: none; }
        }
      </style>
    </head>
    <body>
      <main class="page ${escapeHtml(template)}">
        <section class="topbar">
          <div class="brand">
            ${invoice.business?.logoUrl
              ? `<img class="logo" src="${escapeHtml(invoice.business.logoUrl)}" alt="" />`
              : `<div class="logo-fallback">PE</div>`}
            <div>
              <h2>${escapeHtml(invoice.business?.name || "")}</h2>
              <p class="muted">${escapeHtml(invoice.business?.address || "")}</p>
              <p class="muted">${escapeHtml([invoice.business?.contactNumber, invoice.business?.email].filter(Boolean).join("  |  "))}</p>
            </div>
          </div>
          <div class="title-block">
            <h1>INVOICE</h1>
            <p><strong>${escapeHtml(invoice.invoiceNumber || "")}</strong></p>
            <p class="muted">Status: ${escapeHtml(displayInvoiceStatus(invoice).toUpperCase())}</p>
          </div>
        </section>
        <div class="content">
          <section class="grid">
            <div class="panel">
              <h3>Bill To</h3>
              <p><strong>${escapeHtml(invoice.customer?.name || "")}</strong></p>
              <p>${escapeHtml(invoice.customer?.address || "")}</p>
              <p>${escapeHtml([invoice.customer?.phone, invoice.customer?.email].filter(Boolean).join("  |  "))}</p>
            </div>
            <div class="panel">
              <h3>Invoice Details</h3>
              <div class="meta-row"><span>Invoice Date</span><strong>${formatDate(invoice.invoiceDate)}</strong></div>
              <div class="meta-row"><span>Due Date</span><strong>${formatDate(invoice.dueDate)}</strong></div>
              <div class="meta-row"><span>GSTIN</span><strong>${escapeHtml(invoice.business?.gstNumber || "N/A")}</strong></div>
              <div class="meta-row"><span>Customer ID</span><strong>${escapeHtml(invoice.customer?.customerId || "N/A")}</strong></div>
            </div>
          </section>
          <table>
            <thead>
              <tr>
                <th class="num">#</th>
                <th>Item Description</th>
                <th class="right">Qty</th>
                <th class="right">Unit Price</th>
                <th class="right">Disc.</th>
                <th class="right">Tax</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <section class="totals">
            <div class="total-row"><span>Subtotal</span><strong>${formatCurrency(totals.subtotal)}</strong></div>
            <div class="total-row"><span>Discount</span><strong>- ${formatCurrency(totals.discountTotal)}</strong></div>
            <div class="total-row"><span>Tax</span><strong>${formatCurrency(totals.taxTotal)}</strong></div>
            <div class="total-row grand"><span>Grand Total</span><strong>${formatCurrency(totals.grandTotal)}</strong></div>
          </section>
          <section class="footer">
            <div>
              <div class="note-label">Notes</div>
              <p class="muted" style="color:#64748b">${escapeHtml(invoice.notes || "Thank you for your business.")}</p>
            </div>
            <p class="signature">${escapeHtml(invoice.signatureLabel || "Authorised Signature")}</p>
          </section>
          <div class="page-foot">
            <span>Generated by Prakash Electronics Admin</span>
            <span>${escapeHtml(invoice.invoiceNumber || "")}</span>
          </div>
        </div>
        <div class="accent-bar"></div>
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
