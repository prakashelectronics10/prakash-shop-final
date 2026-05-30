const { escapeHtml, renderEmailLayout } = require("./baseTemplate");

function renderContactAdminEmail(message = {}) {
  const name = message.name || "Website visitor";
  const rating = message.reviewRating ? `${message.reviewRating} / 5` : "Not selected";

  return {
    subject: `New website review from ${name}`,
    text: [
      "New website contact/review submission",
      `Name: ${name}`,
      `Phone: ${message.phone || "Not provided"}`,
      `Email: ${message.email || "Not provided"}`,
      `Rating: ${rating}`,
      `Message: ${message.message || "No message"}`,
    ].join("\n"),
    html: renderEmailLayout({
      title: "New Website Review",
      preheader: `New review/contact message from ${name}`,
      body: `
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">A visitor submitted the website review/contact form.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row("Name", name)}
          ${row("Phone", message.phone)}
          ${row("Email", message.email)}
          ${row("Rating", rating)}
          ${row("Message", message.message || "No message")}
        </table>
      `,
    }),
  };
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #dbeafe;color:#64748b;font-size:13px;width:35%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #dbeafe;color:#0f172a;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(value || "Not provided")}</td>
    </tr>
  `;
}

module.exports = { renderContactAdminEmail };
