const sharp = require("sharp");
const { toMoneyNumber } = require("../utils/invoiceTotals");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const RUPEE = "\u20B9";
const LOGO_SIZE = 46;

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function pdfTextOperand(value) {
  const text = String(value ?? "");
  if (/^[\x00-\x7F]*$/.test(text)) {
    return `(${escapePdfText(text)})`;
  }

  const buffer = Buffer.alloc(2 + text.length * 2);
  buffer[0] = 0xfe;
  buffer[1] = 0xff;
  for (let index = 0; index < text.length; index += 1) {
    buffer.writeUInt16BE(text.charCodeAt(index), 2 + index * 2);
  }
  return `<${buffer.toString("hex").toUpperCase()}>`;
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
  return `${RUPEE} ${toMoneyNumber(value).toLocaleString("en-IN", {
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
    `${pdfTextOperand(value)} Tj`,
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

function imageCommand(name, x, y, width, height) {
  return [
    "q",
    `${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`,
    `/${name} Do`,
    "Q",
  ].join("\n");
}

function clipText(value, maxLength = 56) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function chunkItems(items = [], size = 14) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function resolvePalette(invoice) {
  const theme = invoice.theme || {};
  const template = invoice.template || "modern-blue";
  const base = {
    primary: hexToRgb01(theme.primaryColor, "#2563eb"),
    accent: hexToRgb01(theme.accentColor, "#38bdf8"),
    header: hexToRgb01(theme.headerColor, "#020617"),
    text: hexToRgb01(theme.textColor, "#0f172a"),
    background: hexToRgb01(theme.backgroundColor, "#ffffff"),
    muted: [0.38, 0.45, 0.55],
    panel: [0.96, 0.98, 1],
    tableHead: [0.94, 0.97, 1],
    line: [0.82, 0.87, 0.94],
  };

  if (template === "dark" || template === "glass") {
    return {
      ...base,
      background: template === "dark" ? [0.02, 0.04, 0.09] : [0.93, 0.97, 1],
      text: template === "dark" ? [0.9, 0.95, 1] : base.text,
      muted: template === "dark" ? [0.65, 0.72, 0.82] : [0.34, 0.42, 0.54],
      panel: template === "dark" ? [0.06, 0.1, 0.18] : [0.9, 0.96, 1],
      tableHead: template === "dark" ? [0.09, 0.15, 0.25] : [0.88, 0.94, 1],
      line: template === "dark" ? [0.2, 0.29, 0.42] : [0.7, 0.82, 0.94],
    };
  }

  if (template === "minimal") {
    return { ...base, header: [1, 1, 1], tableHead: [0.98, 0.99, 1], panel: [1, 1, 1] };
  }

  if (template === "corporate") {
    return { ...base, panel: [0.97, 0.98, 0.99], tableHead: [0.92, 0.95, 0.98] };
  }

  return base;
}

function pageContent(invoice, pageItems, pageIndex, pageCount, assets = {}) {
  const palette = resolvePalette(invoice);
  const { primary, accent, header, text, muted, background, panel, tableHead, line } = palette;
  const white = [1, 1, 1];
  const darkHeaderText = invoice.template === "minimal";
  const headerText = darkHeaderText ? text : white;
  const headerMuted = darkHeaderText ? muted : [0.82, 0.88, 0.96];
  const commands = [];

  commands.push(rectCommand(0, 0, PAGE_WIDTH, PAGE_HEIGHT, background));
  commands.push(rectCommand(0, PAGE_HEIGHT - 96, PAGE_WIDTH, 96, header));
  commands.push(rectCommand(0, PAGE_HEIGHT - 101, PAGE_WIDTH, 5, primary));
  const brandTextX = assets.logoName ? MARGIN + LOGO_SIZE + 14 : MARGIN;
  if (assets.logoName) {
    commands.push(rectCommand(MARGIN - 3, PAGE_HEIGHT - 78, LOGO_SIZE + 6, LOGO_SIZE + 6, white));
    commands.push(imageCommand(assets.logoName, MARGIN, PAGE_HEIGHT - 75, LOGO_SIZE, LOGO_SIZE));
  } else {
    commands.push(rectCommand(MARGIN, PAGE_HEIGHT - 75, LOGO_SIZE, LOGO_SIZE, white));
    commands.push(textCommand(MARGIN + 14, PAGE_HEIGHT - 48, "PE", { size: 12, bold: true, color: primary }));
  }
  commands.push(textCommand(brandTextX, PAGE_HEIGHT - 45, clipText(invoice.business?.name || "Business", 34), { size: 17, bold: true, color: headerText }));
  commands.push(textCommand(brandTextX, PAGE_HEIGHT - 64, clipText(invoice.business?.address || "", 54), { size: 8.8, color: headerMuted }));
  commands.push(textCommand(brandTextX, PAGE_HEIGHT - 80, clipText(`${invoice.business?.contactNumber || ""}  ${invoice.business?.email || ""}`, 54), { size: 8.8, color: headerMuted }));
  commands.push(textCommand(PAGE_WIDTH - 190, PAGE_HEIGHT - 47, "INVOICE", { size: 22, bold: true, color: headerText }));
  commands.push(textCommand(PAGE_WIDTH - 190, PAGE_HEIGHT - 67, invoice.invoiceNumber || "", { size: 10, bold: true, color: headerMuted }));
  commands.push(textCommand(PAGE_WIDTH - 190, PAGE_HEIGHT - 82, `Status: ${String(invoice.paymentStatus || "pending").toUpperCase()}`, { size: 9, color: headerMuted }));

  let y = PAGE_HEIGHT - 132;
  commands.push(textCommand(MARGIN, y, "Bill To", { size: 11, bold: true, color: primary }));
  commands.push(textCommand(MARGIN, y - 18, clipText(invoice.customer?.name || "", 38), { size: 12, bold: true, color: text }));
  commands.push(textCommand(MARGIN, y - 34, clipText(invoice.customer?.address || "", 58), { size: 8.8, color: muted }));
  commands.push(textCommand(MARGIN, y - 49, clipText(`${invoice.customer?.phone || ""}  ${invoice.customer?.email || ""}`, 58), { size: 8.8, color: muted }));

  commands.push(textCommand(PAGE_WIDTH - 205, y, "Invoice Details", { size: 11, bold: true, color: primary }));
  commands.push(textCommand(PAGE_WIDTH - 205, y - 18, `Invoice Date: ${formatDate(invoice.invoiceDate)}`, { size: 9, color: text }));
  commands.push(textCommand(PAGE_WIDTH - 205, y - 34, `Due Date: ${formatDate(invoice.dueDate)}`, { size: 9, color: text }));
  if (invoice.business?.gstNumber) commands.push(textCommand(PAGE_WIDTH - 205, y - 50, `GST: ${invoice.business.gstNumber}`, { size: 9, color: text }));

  y -= 86;
  commands.push(rectCommand(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 27, tableHead));
  commands.push(lineCommand(MARGIN, y, PAGE_WIDTH - MARGIN, y, line));
  commands.push(textCommand(MARGIN + 10, y + 9, "#", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 35, y + 9, "Item", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 255, y + 9, "Qty", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 300, y + 9, "Price", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 370, y + 9, "Tax", { size: 8.5, bold: true, color: muted }));
  commands.push(textCommand(MARGIN + 440, y + 9, "Total", { size: 8.5, bold: true, color: muted }));

  y -= 24;
  pageItems.forEach((item, index) => {
    const absoluteIndex = pageIndex * 14 + index + 1;
    commands.push(lineCommand(MARGIN, y - 5, PAGE_WIDTH - MARGIN, y - 5, line, 0.45));
    commands.push(textCommand(MARGIN + 10, y + 3, absoluteIndex, { size: 8.5, color: muted }));
    commands.push(textCommand(MARGIN + 35, y + 3, clipText(item.name, 34), { size: 9.2, bold: true, color: text }));
    commands.push(textCommand(MARGIN + 255, y + 3, item.quantity, { size: 8.5, color: text }));
    commands.push(textCommand(MARGIN + 300, y + 3, money(item.unitPrice), { size: 8.5, color: text }));
    commands.push(textCommand(MARGIN + 370, y + 3, `${item.taxRate || 0}%`, { size: 8.5, color: text }));
    commands.push(textCommand(MARGIN + 440, y + 3, money(item.totalPrice), { size: 8.5, bold: true, color: text }));
    y -= 29;
  });

  if (pageIndex === pageCount - 1) {
    y = Math.min(y - 14, 210);
    const totalX = PAGE_WIDTH - 245;
    commands.push(rectCommand(totalX - 10, y - 84, 205, 122, panel));
    commands.push(textCommand(totalX, y + 17, "Subtotal", { size: 9, color: muted }));
    commands.push(textCommand(totalX + 102, y + 17, money(invoice.totals?.subtotal), { size: 9, bold: true, color: text }));
    commands.push(textCommand(totalX, y - 3, "Discount", { size: 9, color: muted }));
    commands.push(textCommand(totalX + 102, y - 3, `-${money(invoice.totals?.discountTotal)}`, { size: 9, bold: true, color: text }));
    commands.push(textCommand(totalX, y - 23, "Tax", { size: 9, color: muted }));
    commands.push(textCommand(totalX + 102, y - 23, money(invoice.totals?.taxTotal), { size: 9, bold: true, color: text }));
    commands.push(rectCommand(totalX - 10, y - 72, 205, 32, accent));
    commands.push(textCommand(totalX, y - 61, "Grand Total", { size: 10, bold: true, color: white }));
    commands.push(textCommand(totalX + 102, y - 61, money(invoice.totals?.grandTotal), { size: 10, bold: true, color: white }));

    commands.push(textCommand(MARGIN, 132, clipText(invoice.notes || "Thank you for your business.", 72), { size: 9, color: muted }));
    commands.push(lineCommand(PAGE_WIDTH - 210, 116, PAGE_WIDTH - MARGIN, 116, [0.45, 0.52, 0.62], 0.8));
    commands.push(textCommand(PAGE_WIDTH - 188, 98, invoice.signatureLabel || "Authorised Signature", { size: 8.5, color: muted }));
  } else {
    commands.push(textCommand(MARGIN, 90, "Continued on next page", { size: 9, color: muted }));
  }

  commands.push(textCommand(MARGIN, 36, `Generated by Prakash Electronics Admin`, { size: 7.5, color: muted }));
  commands.push(textCommand(PAGE_WIDTH - 95, 36, `Page ${pageIndex + 1} of ${pageCount}`, { size: 7.5, color: muted }));

  return commands.join("\n");
}

async function loadLogoImage(url) {
  const logoUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(logoUrl)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(logoUrl, { signal: controller.signal });
    if (!response.ok) return null;
    const input = Buffer.from(await response.arrayBuffer());
    const converted = await sharp(input)
      .rotate()
      .resize(160, 160, { fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      data: converted.data,
      width: converted.info.width,
      height: converted.info.height,
    };
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPdf(objects) {
  const chunks = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = chunks.reduce((total, chunk) => total + chunk.length, 0);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "utf8"));
    chunks.push(Buffer.isBuffer(object) ? object : Buffer.from(String(object), "utf8"));
    chunks.push(Buffer.from("\nendobj\n", "utf8"));
  });
  const xrefOffset = chunks.reduce((total, chunk) => total + chunk.length, 0);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(Buffer.from(xref, "utf8"));
  return Buffer.concat(chunks);
}

async function generateInvoicePdf(invoiceDoc) {
  const invoice = invoiceDoc.toObject ? invoiceDoc.toObject() : invoiceDoc;
  const pages = chunkItems(invoice.items, 14);
  const objects = [];
  const pageObjectIds = [];
  const logo = await loadLogoImage(invoice.business?.logoUrl);

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let logoObjectId = null;
  if (logo?.data?.length) {
    logoObjectId = objects.length + 1;
    objects.push(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`, "utf8"),
      logo.data,
      Buffer.from("\nendstream", "utf8"),
    ]));
  }

  pages.forEach((items, pageIndex) => {
    const assets = logoObjectId ? { logoName: "ImLogo" } : {};
    const content = pageContent(invoice, items, pageIndex, pages.length, assets);
    const streamId = objects.length + 2;
    const pageId = objects.length + 1;
    const xObjects = logoObjectId ? `/XObject << /ImLogo ${logoObjectId} 0 R >>` : "";
    pageObjectIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjects} >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  return buildPdf(objects);
}

module.exports = { generateInvoicePdf, money, formatDate };
