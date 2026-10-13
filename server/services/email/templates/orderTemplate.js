const { escapeHtml, renderEmailLayout } = require("./baseTemplate");
const { formatINR } = require("../../../utils/productPricing");

function row(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #dbeafe;color:#64748b;font-size:13px;width:35%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #dbeafe;color:#0f172a;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(value || "Not provided")}</td>
    </tr>
  `;
}

function itemLines(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return ["No items"];
  return items.map((item, index) => {
    const qty = Number(item.quantity || 1);
    const name = item.productName || "Product";
    const line = formatINR(item.discountedLineTotal ?? item.lineTotal);
    return `${index + 1}. ${name} x${qty} — ${line}`;
  });
}

function itemsHtml(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return row("Items", "No items");
  return items
    .map((item, index) => {
      const qty = Number(item.quantity || 1);
      const name = `${item.productName || "Product"} × ${qty}`;
      const line = formatINR(item.discountedLineTotal ?? item.lineTotal);
      return row(`Item ${index + 1}`, `${name} — ${line}`);
    })
    .join("");
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function renderOrderAdminEmail(order = {}) {
  const customer = order.customer || {};
  const customerName = customer.name || "Customer";
  const orderId = order.orderId || "Unknown";
  const total = formatINR(order.total);
  const paidAt = formatDateTime(order.paidAt || order.createdAt);
  const itemCount = Number(order.itemCount || order.items?.length || 0);

  return {
    subject: `New product order ${orderId} — ${total}`,
    text: [
      "New paid product order from the website",
      `Order ID: ${orderId}`,
      `Customer: ${customerName}`,
      `Phone: ${customer.phone || "Not provided"}`,
      `Address: ${customer.address || "Not provided"}`,
      `Pincode: ${customer.pincode || "Not provided"}`,
      `Landmark: ${customer.landmark || "Not provided"}`,
      `Message: ${customer.message || "No message"}`,
      `Items (${itemCount}):`,
      ...itemLines(order),
      order.discountTotal > 0 ? `Discount: ${formatINR(order.discountTotal)}` : "",
      `Total paid: ${total}`,
      `Paid at: ${paidAt}`,
      `Payment ID: ${order.razorpayPaymentId || "N/A"}`,
    ].filter(Boolean).join("\n"),
    html: renderEmailLayout({
      title: "New Product Order",
      preheader: `Paid order ${orderId} from ${customerName} — ${total}`,
      body: `
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">A customer completed payment for a product order on the website.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row("Order ID", orderId)}
          ${row("Customer Name", customerName)}
          ${row("Phone", customer.phone)}
          ${row("Address", customer.address)}
          ${row("Pincode", customer.pincode)}
          ${row("Landmark", customer.landmark || "Not provided")}
          ${row("Message", customer.message || "No message")}
          ${itemsHtml(order)}
          ${Number(order.discountTotal || 0) > 0 ? row("Discount", formatINR(order.discountTotal)) : ""}
          ${row("Total Paid", total)}
          ${row("Paid At", paidAt)}
          ${row("Payment ID", order.razorpayPaymentId || "N/A")}
          ${row("Status", order.orderStatus || "confirmed")}
        </table>
      `,
    }),
  };
}

module.exports = { renderOrderAdminEmail };
