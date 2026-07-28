const sharp = require("sharp");
const { toMoneyNumber } = require("../utils/invoiceTotals");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LOGO_SIZE = 44;
const ITEMS_PER_PAGE = 12;

/* Approximate Helvetica glyph widths (1000 units = 1em) for right-align. */
const HELVETICA_WIDTHS = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

const HELVETICA_BOLD_WIDTHS = {
  ...HELVETICA_WIDTHS,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 889, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
};

function measureText(value, size = 10, bold = false) {
  const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let width = 0;
  for (const char of String(value ?? "")) {
    width += table[char] || 600;
  }
  return (width * size) / 1000;
}

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

function mixRgb(a, b, amount = 0.5) {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function money(value) {
  return `Rs. ${toMoneyNumber(value).toLocaleString("en-IN", {
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
  const bold = Boolean(options.bold);
  const font = bold ? "/F2" : "/F1";
  const [r, g, b] = options.color || [0.07, 0.09, 0.15];
  let drawX = x;
  if (options.align === "right") {
    drawX = x - measureText(value, size, bold);
  } else if (options.align === "center") {
    drawX = x - measureText(value, size, bold) / 2;
  }
  return [
    "BT",
    `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
    `${font} ${size} Tf`,
    `${drawX.toFixed(2)} ${y.toFixed(2)} Td`,
    `${pdfTextOperand(value)} Tj`,
    "ET",
  ].join("\n");
}

function rectCommand(x, y, width, height, color) {
  const [r, g, b] = color;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg\n${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`;
}

function strokeRectCommand(x, y, width, height, color, lineWidth = 0.8) {
  const [r, g, b] = color;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG\n${lineWidth} w\n${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`;
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

function clipTextToWidth(value, maxWidth, size = 10, bold = false) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (measureText(text, size, bold) <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && measureText(`${clipped}...`, size, bold) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function chunkItems(items = [], size = ITEMS_PER_PAGE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

/**
 * Always honour admin-chosen theme colours.
 * Template only adjusts layout accents / contrast helpers.
 */
function resolvePalette(invoice) {
  const theme = invoice.theme || {};
  const template = invoice.template || "modern-blue";
  const primary = hexToRgb01(theme.primaryColor, "#2563eb");
  const accent = hexToRgb01(theme.accentColor, "#38bdf8");
  const header = hexToRgb01(theme.headerColor, "#020617");
  const text = hexToRgb01(theme.textColor, "#0f172a");
  const background = hexToRgb01(theme.backgroundColor, "#ffffff");
  const white = [1, 1, 1];
  const black = [0.07, 0.09, 0.15];

  const darkBg = luminance(background) < 0.35 || template === "dark";
  const darkHeader = luminance(header) < 0.45;
  const headerText = darkHeader ? white : text;
  const headerMuted = darkHeader ? mixRgb(white, header, 0.35) : mixRgb(text, white, 0.45);
  const muted = darkBg ? mixRgb(text, white, 0.35) : mixRgb(text, white, 0.52);
  const panel = darkBg ? mixRgb(background, white, 0.08) : mixRgb(background, primary, 0.06);
  const tableHead = darkBg ? mixRgb(background, primary, 0.22) : mixRgb(primary, white, 0.88);
  const tableAlt = darkBg ? mixRgb(background, white, 0.05) : mixRgb(primary, white, 0.94);
  const line = darkBg ? mixRgb(background, white, 0.18) : mixRgb(primary, white, 0.72);
  const border = darkBg ? mixRgb(background, white, 0.22) : mixRgb(primary, white, 0.65);

  return {
    template,
    primary,
    accent,
    header,
    text: darkBg ? mixRgb(text, white, 0.15) : text,
    background,
    muted,
    panel,
    tableHead,
    tableAlt,
    line,
    border,
    headerText,
    headerMuted,
    white,
    black,
    darkBg,
    darkHeader,
  };
}

/** Column right edges / positions for aligned money columns. */
const COL = {
  indexLeft: MARGIN + 8,
  itemLeft: MARGIN + 34,
  qtyRight: MARGIN + 268,
  priceRight: MARGIN + 348,
  discountRight: MARGIN + 418,
  taxRight: MARGIN + 458,
  totalRight: PAGE_WIDTH - MARGIN - 8,
  itemMaxWidth: 200,
};

function pageContent(invoice, pageItems, pageIndex, pageCount, assets = {}) {
  const palette = resolvePalette(invoice);
  const {
    template,
    primary,
    accent,
    header,
    text,
    muted,
    background,
    panel,
    tableHead,
    tableAlt,
    line,
    border,
    headerText,
    headerMuted,
    white,
    darkHeader,
  } = palette;
  const commands = [];
  const status = String(invoice.paymentStatus || "pending").toUpperCase();

  commands.push(rectCommand(0, 0, PAGE_WIDTH, PAGE_HEIGHT, background));

  if (template === "minimal") {
    commands.push(rectCommand(0, PAGE_HEIGHT - 8, PAGE_WIDTH, 8, primary));
    commands.push(lineCommand(MARGIN, PAGE_HEIGHT - 108, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 108, primary, 1.4));
  } else if (template === "corporate") {
    commands.push(rectCommand(0, PAGE_HEIGHT - 108, PAGE_WIDTH, 108, header));
    commands.push(rectCommand(0, PAGE_HEIGHT - 112, PAGE_WIDTH, 4, primary));
    commands.push(rectCommand(0, 0, 8, PAGE_HEIGHT, primary));
  } else if (template === "glass") {
    commands.push(rectCommand(0, PAGE_HEIGHT - 112, PAGE_WIDTH, 112, mixRgb(header, white, 0.12)));
    commands.push(rectCommand(MARGIN, PAGE_HEIGHT - 104, CONTENT_WIDTH, 88, mixRgb(header, white, darkHeader ? 0.08 : 0.82)));
    commands.push(strokeRectCommand(MARGIN, PAGE_HEIGHT - 104, CONTENT_WIDTH, 88, mixRgb(primary, white, 0.35), 1));
    commands.push(rectCommand(MARGIN, PAGE_HEIGHT - 108, CONTENT_WIDTH, 4, accent));
  } else if (template === "dark") {
    commands.push(rectCommand(0, PAGE_HEIGHT - 108, PAGE_WIDTH, 108, header));
    commands.push(rectCommand(0, PAGE_HEIGHT - 112, PAGE_WIDTH, 4, accent));
  } else {
    /* modern-blue and default */
    commands.push(rectCommand(0, PAGE_HEIGHT - 108, PAGE_WIDTH, 108, header));
    commands.push(rectCommand(0, PAGE_HEIGHT - 112, PAGE_WIDTH, 4, primary));
  }

  const brandY = template === "glass" ? PAGE_HEIGHT - 78 : PAGE_HEIGHT - 72;
  const brandTextX = assets.logoName ? MARGIN + LOGO_SIZE + 16 : MARGIN + (template === "glass" ? 14 : 0);
  const brandMax = template === "glass" ? 250 : 280;

  if (assets.logoName) {
    const logoX = template === "glass" ? MARGIN + 12 : MARGIN;
    const logoY = brandY - LOGO_SIZE + 18;
    commands.push(rectCommand(logoX - 2, logoY - 2, LOGO_SIZE + 4, LOGO_SIZE + 4, white));
    commands.push(imageCommand(assets.logoName, logoX, logoY, LOGO_SIZE, LOGO_SIZE));
  } else {
    const logoX = template === "glass" ? MARGIN + 12 : MARGIN;
    const logoY = brandY - LOGO_SIZE + 18;
    commands.push(rectCommand(logoX, logoY, LOGO_SIZE, LOGO_SIZE, white));
    commands.push(textCommand(logoX + LOGO_SIZE / 2, logoY + 15, "PE", {
      size: 13,
      bold: true,
      color: primary,
      align: "center",
    }));
  }

  const brandName = clipTextToWidth(invoice.business?.name || "Business", brandMax, 15, true);
  commands.push(textCommand(brandTextX, brandY + 8, brandName, { size: 15, bold: true, color: headerText }));
  commands.push(textCommand(
    brandTextX,
    brandY - 10,
    clipTextToWidth(invoice.business?.address || "", brandMax + 20, 8.2),
    { size: 8.2, color: headerMuted },
  ));
  const contactLine = [invoice.business?.contactNumber, invoice.business?.email].filter(Boolean).join("  |  ");
  if (contactLine) {
    commands.push(textCommand(
      brandTextX,
      brandY - 24,
      clipTextToWidth(contactLine, brandMax + 20, 8.2),
      { size: 8.2, color: headerMuted },
    ));
  }

  const rightX = PAGE_WIDTH - MARGIN - (template === "glass" ? 14 : 0);
  commands.push(textCommand(rightX, brandY + 10, "INVOICE", {
    size: 20,
    bold: true,
    color: headerText,
    align: "right",
  }));
  commands.push(textCommand(rightX, brandY - 8, invoice.invoiceNumber || "", {
    size: 10,
    bold: true,
    color: headerMuted,
    align: "right",
  }));
  commands.push(textCommand(rightX, brandY - 24, `Status: ${status}`, {
    size: 8.5,
    color: headerMuted,
    align: "right",
  }));

  /* Bill To + Invoice meta cards */
  let y = PAGE_HEIGHT - 148;
  const cardHeight = 78;
  const cardGap = 12;
  const cardWidth = (CONTENT_WIDTH - cardGap) / 2;

  commands.push(rectCommand(MARGIN, y - cardHeight, cardWidth, cardHeight, panel));
  commands.push(strokeRectCommand(MARGIN, y - cardHeight, cardWidth, cardHeight, border, 0.7));
  commands.push(rectCommand(MARGIN + cardWidth + cardGap, y - cardHeight, cardWidth, cardHeight, panel));
  commands.push(strokeRectCommand(MARGIN + cardWidth + cardGap, y - cardHeight, cardWidth, cardHeight, border, 0.7));

  commands.push(textCommand(MARGIN + 12, y - 16, "BILL TO", { size: 8, bold: true, color: primary }));
  commands.push(textCommand(MARGIN + 12, y - 34, clipTextToWidth(invoice.customer?.name || "Customer", cardWidth - 24, 11, true), {
    size: 11,
    bold: true,
    color: text,
  }));
  commands.push(textCommand(MARGIN + 12, y - 50, clipTextToWidth(invoice.customer?.address || "", cardWidth - 24, 8.2), {
    size: 8.2,
    color: muted,
  }));
  const customerContact = [invoice.customer?.phone, invoice.customer?.email].filter(Boolean).join("  |  ");
  if (customerContact) {
    commands.push(textCommand(MARGIN + 12, y - 64, clipTextToWidth(customerContact, cardWidth - 24, 8.2), {
      size: 8.2,
      color: muted,
    }));
  }

  const metaX = MARGIN + cardWidth + cardGap + 12;
  commands.push(textCommand(metaX, y - 16, "INVOICE DETAILS", { size: 8, bold: true, color: primary }));
  const metaRows = [
    ["Invoice Date", formatDate(invoice.invoiceDate)],
    ["Due Date", formatDate(invoice.dueDate)],
  ];
  if (invoice.business?.gstNumber) metaRows.push(["GSTIN", invoice.business.gstNumber]);
  if (invoice.customer?.customerId) metaRows.push(["Customer ID", invoice.customer.customerId]);
  metaRows.slice(0, 4).forEach((row, index) => {
    const rowY = y - 34 - index * 14;
    commands.push(textCommand(metaX, rowY, row[0], { size: 8.2, color: muted }));
    commands.push(textCommand(MARGIN + CONTENT_WIDTH - 12, rowY, clipText(row[1], 28), {
      size: 8.5,
      bold: true,
      color: text,
      align: "right",
    }));
  });

  /* Items table */
  y -= cardHeight + 22;
  const tableTop = y;
  const headerH = 26;
  const rowH = 28;
  const tableBottomPad = pageIndex === pageCount - 1 ? 168 : 70;
  const tableWidth = CONTENT_WIDTH;

  commands.push(rectCommand(MARGIN, tableTop - headerH, tableWidth, headerH, tableHead));
  commands.push(textCommand(COL.indexLeft, tableTop - 17, "#", { size: 8, bold: true, color: muted }));
  commands.push(textCommand(COL.itemLeft, tableTop - 17, "Item Description", { size: 8, bold: true, color: muted }));
  commands.push(textCommand(COL.qtyRight, tableTop - 17, "Qty", { size: 8, bold: true, color: muted, align: "right" }));
  commands.push(textCommand(COL.priceRight, tableTop - 17, "Unit Price", { size: 8, bold: true, color: muted, align: "right" }));
  commands.push(textCommand(COL.discountRight, tableTop - 17, "Disc.", { size: 8, bold: true, color: muted, align: "right" }));
  commands.push(textCommand(COL.taxRight, tableTop - 17, "Tax", { size: 8, bold: true, color: muted, align: "right" }));
  commands.push(textCommand(COL.totalRight, tableTop - 17, "Amount", { size: 8, bold: true, color: muted, align: "right" }));

  y = tableTop - headerH;
  pageItems.forEach((item, index) => {
    const absoluteIndex = pageIndex * ITEMS_PER_PAGE + index + 1;
    if (index % 2 === 1) {
      commands.push(rectCommand(MARGIN, y - rowH, tableWidth, rowH, tableAlt));
    }
    commands.push(lineCommand(MARGIN, y - rowH, PAGE_WIDTH - MARGIN, y - rowH, line, 0.4));

    const textY = y - 18;
    commands.push(textCommand(COL.indexLeft, textY, String(absoluteIndex), { size: 8.5, color: muted }));
    commands.push(textCommand(
      COL.itemLeft,
      textY,
      clipTextToWidth(item.name || `Item ${absoluteIndex}`, COL.itemMaxWidth, 9, true),
      { size: 9, bold: true, color: text },
    ));
    commands.push(textCommand(COL.qtyRight, textY, String(item.quantity ?? 0), {
      size: 8.5,
      color: text,
      align: "right",
    }));
    commands.push(textCommand(COL.priceRight, textY, money(item.unitPrice), {
      size: 8.5,
      color: text,
      align: "right",
    }));
    commands.push(textCommand(COL.discountRight, textY, money(item.discount), {
      size: 8.5,
      color: text,
      align: "right",
    }));
    commands.push(textCommand(COL.taxRight, textY, `${toMoneyNumber(item.taxRate || 0)}%`, {
      size: 8.5,
      color: text,
      align: "right",
    }));
    commands.push(textCommand(COL.totalRight, textY, money(item.totalPrice), {
      size: 8.5,
      bold: true,
      color: text,
      align: "right",
    }));
    y -= rowH;
  });

  commands.push(strokeRectCommand(MARGIN, y, tableWidth, tableTop - y, border, 0.8));

  if (pageIndex === pageCount - 1) {
    const totalsWidth = 220;
    const totalsX = PAGE_WIDTH - MARGIN - totalsWidth;
    const totalsTop = Math.min(y - 16, tableBottomPad + 110);
    const rowGap = 20;
    let ty = totalsTop;

    const totalRows = [
      { label: "Subtotal", value: money(invoice.totals?.subtotal), bold: false },
      { label: "Discount", value: `- ${money(invoice.totals?.discountTotal)}`, bold: false },
      { label: "Tax", value: money(invoice.totals?.taxTotal), bold: false },
    ];

    commands.push(rectCommand(totalsX, ty - 88, totalsWidth, 102, panel));
    commands.push(strokeRectCommand(totalsX, ty - 88, totalsWidth, 102, border, 0.8));

    totalRows.forEach((row) => {
      commands.push(textCommand(totalsX + 12, ty - 14, row.label, { size: 9, color: muted }));
      commands.push(textCommand(PAGE_WIDTH - MARGIN - 12, ty - 14, row.value, {
        size: 9,
        bold: true,
        color: text,
        align: "right",
      }));
      ty -= rowGap;
    });

    commands.push(rectCommand(totalsX, ty - 28, totalsWidth, 28, primary));
    commands.push(textCommand(totalsX + 12, ty - 18, "Grand Total", {
      size: 10,
      bold: true,
      color: white,
    }));
    commands.push(textCommand(PAGE_WIDTH - MARGIN - 12, ty - 18, money(invoice.totals?.grandTotal), {
      size: 10,
      bold: true,
      color: white,
      align: "right",
    }));

    /* Notes + signature */
    const notesY = 118;
    commands.push(textCommand(MARGIN, notesY + 28, "Notes", { size: 8, bold: true, color: primary }));
    commands.push(textCommand(
      MARGIN,
      notesY + 12,
      clipTextToWidth(invoice.notes || "Thank you for your business.", 320, 8.5),
      { size: 8.5, color: muted },
    ));

    commands.push(lineCommand(PAGE_WIDTH - MARGIN - 170, notesY + 18, PAGE_WIDTH - MARGIN, notesY + 18, muted, 0.9));
    commands.push(textCommand(PAGE_WIDTH - MARGIN - 85, notesY, invoice.signatureLabel || "Authorised Signature", {
      size: 8,
      color: muted,
      align: "center",
    }));
  } else {
    commands.push(textCommand(PAGE_WIDTH / 2, 78, "Continued on next page...", {
      size: 9,
      color: muted,
      align: "center",
    }));
  }

  commands.push(lineCommand(MARGIN, 52, PAGE_WIDTH - MARGIN, 52, line, 0.6));
  commands.push(textCommand(MARGIN, 36, "Generated by Prakash Electronics Admin", { size: 7.5, color: muted }));
  commands.push(textCommand(PAGE_WIDTH - MARGIN, 36, `Page ${pageIndex + 1} of ${pageCount}`, {
    size: 7.5,
    color: muted,
    align: "right",
  }));

  /* Accent footer bar for branded templates */
  if (template !== "minimal") {
    commands.push(rectCommand(0, 0, PAGE_WIDTH, 6, accent));
  } else {
    commands.push(rectCommand(0, 0, PAGE_WIDTH, 4, primary));
  }

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
  const pages = chunkItems(invoice.items, ITEMS_PER_PAGE);
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
