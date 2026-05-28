const { toMoneyNumber } = require("../utils/invoiceTotals");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function hexToRgb01(hex, fallback = "#2563eb") {
  const value = /^#[0-9a-fA-F]{6}$/.test(String(hex || "")) ? hex : fallback;
  const intValue = Number.parseInt(value.slice(1), 16);
  return [
    ((intValue >> 16) & 255) / 255,
    ((intValue >> 8) & 255) / 255,
    (intValue & 255) / 255,
  ];
}

function money(value) {
  return `INR ${toMoneyNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function textCommand(x, y, value, options = {}) {
  const size = options.size || 10;
  const font = options.bold ? "/F2" : "/F1";
  const [r, g, b] = options.color || [0.07, 0.09, 0.15];
  return [
    "BT",
    `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
    `${font} ${size} Tf`,
    `${x.toFixed(2)} ${y.toFixed(2)} Td`,
    `(${escapePdfText(value)}) Tj`,
    "ET",
  ].join("\n");
}

function rectCommand(x, y, width, height, color) {
  const [r, g, b] = color;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`;
}

function lineCommand(x1, y1, x2, y2, color = [0.8, 0.85, 0.92], width = 0.7) {
  const [r, g, b] = color;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG\n${width} w\n${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
}

function chunkItems(items = [], size = 14) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function pageContent(invoice, pageItems, pageIndex, pageCount) {
  const primary = hexToRgb01(invoice.theme?.primaryColor, "#2563eb");
  const accent = hexToRgb01(invoice.theme?.accentColor, "#38bdf8");
  const dark = hexToRgb01(invoice.theme?.headerColor, "#020617");
  const text = [0.07, 0.09, 0.15];
  const muted = [0.38, 0.45, 0.55];
  const white = [1, 1, 1];
  const commands = [];

  commands.push(rectCommand(0, PAGE_HEIGHT - 96, PAGE_WIDTH, 96, dark));
  commands.push(rectCommand(0, PAGE_HEIGHT - 101, PAGE_WIDTH, 5, primary));
  commands.push(textCommand(MARGIN, PAGE_HEIGHT - 48, invoice.business?.name || "Business", { size: 18, bold: true, color: white }));
  commands.push(textCommand(MARGIN, PAGE_HEIGHT - 67, invoice.business?.address || "", { size: 8.8, color: [0.82, 0.88, 0.96] }));
  commands.push(textCommand(MARGIN, PAGE_HEIGHT - 82, `${invoice.business?.contactNumber || ""}  ${invoice.business?.email || ""}`, { size: 8.8, color: [0.82, 0.88, 0.96] }));
  commands.push(textCommand(PAGE_WIDTH - 190, PAGE_HEIGHT - 47, "INVOICE", { size: 22, bold: true, color: white }));
  commands.push(textCommand(PAGE_WIDTH - 190, PAGE_HEIGHT - 67, invoice.invoiceNumber || "", { size: 10, bold: true, color: [0.82, 0.88, 0.96] }));
  commands.push(textCommand(PAGE_WIDTH - 190, PAGE_HEIGHT - 82, `Status: ${String(invoice.paymentStatus || "pending").toUpperCase()}`, { size: 9, color: [0.82, 0.88, 0.96] }));

  let y = PAGE_HEIGHT - 132;
  commands.push(textCommand(MARGIN, y, "Bill To", { size: 11, bold: true, color: primary }));
  commands.push(textCommand(MARGIN, y - 18, invoice.customer?.name || "", { size: 12, bold: true, color: text }));
  commands.push(textCommand(MARGIN, y - 34, invoice.customer?.address || "", { size: 8.8, color: muted }));
  commands.push(textCommand(MARGIN, y - 49, `${invoice.customer?.phone || ""}  ${invoice.customer?.email || ""}`, { size: 8.8, color: muted }));

  commands.push(textCommand(PAGE_WIDTH - 205, y, "Invoice Details", { size: 11, bold: true, color: primary }));
  commands.push(textCommand(PAGE_WIDTH - 205, y - 18, `Invoice Date: ${formatDate(invoice.invoiceDate)}`, { size: 9, color: text }));
  commands.push(textCommand(PAGE_WIDTH - 205, y - 34, `Due Date: ${formatDate(invoice.dueDate)}`, { size: 9, color: text }));
  if (invoice.business?.gstNumber) commands.push(textCommand(PAGE_WIDTH - 205, y - 50, `GST: ${invoice.business.gstNumber}`, { size: 9, color: text }));

  y -= 86;
  commands.push(rectCommand(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 27, [0.94, 0.97, 1]));
  commands.push(lineCommand(MARGIN, y, PAGE_WIDTH - MARGIN, y, [0.7, 0.8, 0.92]));
  commands.push(textCommand(MARGIN + 10, y + 9, "#", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 35, y + 9, "Item", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 255, y + 9, "Qty", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 300, y + 9, "Price", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 370, y + 9, "Tax", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 440, y + 9, "Total", { size: 8.5, bold: true, color: muted }));

  y -= 24;
  pageItems.forEach((item, index) => {
    const absoluteIndex = pageIndex * 14 + index + 1;
    commands.push(lineCommand(MARGIN, y - 5, PAGE_WIDTH - MARGIN, y - 5, [0.88, 0.91, 0.96], 0.45));
    commands.push(textCommand(MARGIN + 10, y + 3, absoluteIndex, { size: 8.5, color: muted }));
    commands.push(textCommand(MARGIN + 35, y + 3, item.name, { size: 9.2, bold: true, color: text }));
    commands.push(textCommand(MARGIN + 255, y + 3, item.quantity, { size: 8.5, color: text }));
    commands.push(textCommand(MARGIN + 300, y + 3, money(item.unitPrice), { size: 8.5, color: text }));
    commands.push(textCommand(MARGIN + 370, y + 3, `${item.taxRate || 0}%`, { size: 8.5, color: text }));
    commands.push(textCommand(MARGIN + 440, y + 3, money(item.totalPrice), { size: 8.5, bold: true, color: text }));
    y -= 29;
  });

  if (pageIndex === pageCount - 1) {
    y = Math.min(y - 14, 210);
    const totalX = PAGE_WIDTH - 245;
    commands.push(rectCommand(totalX - 10, y - 84, 205, 122, [0.96, 0.98, 1]));
    commands.push(textCommand(totalX, y + 17, "Subtotal", { size: 9, color: muted }));
    commands.push(textCommand(totalX + 102, y + 17, money(invoice.totals?.subtotal), { size: 9, bold: true, color: text }));
    commands.push(textCommand(totalX, y - 3, "Discount", { size: 9, color: muted }));
    commands.push(textCommand(totalX + 102, y - 3, `-${money(invoice.totals?.discountTotal)}`, { size: 9, bold: true, color: text }));
    commands.push(textCommand(totalX, y - 23, "Tax", { size: 9, color: muted }));
    commands.push(textCommand(totalX + 102, y - 23, money(invoice.totals?.taxTotal), { size: 9, bold: true, color: text }));
    commands.push(rectCommand(totalX - 10, y - 72, 205, 32, accent));
    commands.push(textCommand(totalX, y - 61, "Grand Total", { size: 10, bold: true, color: white }));
    commands.push(textCommand(totalX + 102, y - 61, money(invoice.totals?.grandTotal), { size: 10, bold: true, color: white }));

    commands.push(textCommand(MARGIN, 132, invoice.notes || "Thank you for your business.", { size: 9, color: muted }));
    commands.push(lineCommand(PAGE_WIDTH - 210, 116, PAGE_WIDTH - MARGIN, 116, [0.45, 0.52, 0.62], 0.8));
    commands.push(textCommand(PAGE_WIDTH - 188, 98, invoice.signatureLabel || "Authorised Signature", { size: 8.5, color: muted }));
  } else {
    commands.push(textCommand(MARGIN, 90, "Continued on next page", { size: 9, color: muted }));
  }

  commands.push(textCommand(MARGIN, 36, `Generated by Prakash Electronics Admin`, { size: 7.5, color: muted }));
  commands.push(textCommand(PAGE_WIDTH - 95, 36, `Page ${pageIndex + 1} of ${pageCount}`, { size: 7.5, color: muted }));

  return commands.join("\n");
}

function buildPdf(objects) {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function generateInvoicePdf(invoiceDoc) {
  const invoice = invoiceDoc.toObject ? invoiceDoc.toObject() : invoiceDoc;
  const pages = chunkItems(invoice.items, 14);
  const objects = [];
  const pageObjectIds = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  pages.forEach((items, pageIndex) => {
    const content = pageContent(invoice, items, pageIndex, pages.length);
    const streamId = objects.length + 2;
    const pageId = objects.length + 1;
    pageObjectIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  return buildPdf(objects);
}

module.exports = { generateInvoicePdf, money, formatDate };
