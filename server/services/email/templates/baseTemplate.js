const env = require("../../../config/env");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailLayout({
  title,
  preheader = "",
  body,
  footer = "",
}) {
  const brandName = escapeHtml(env.mail.fromName || "Prakash Electronics");
  const websiteUrl = String(env.mail.websiteUrl || env.productionUrl || "").trim();
  const safeUrl = escapeHtml(websiteUrl);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6ff;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #bfdbfe;border-radius:20px;overflow:hidden;box-shadow:0 20px 44px rgba(15,23,42,0.10);">
            <tr>
              <td style="background:#0f6fdc;padding:24px 28px;color:#ffffff;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;opacity:.86;">${brandName}</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fbff;color:#64748b;font-size:12px;text-align:center;line-height:1.6;">
                ${footer || `${brandName}${safeUrl ? ` &bull; ${safeUrl}` : ""}`}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { escapeHtml, renderEmailLayout };
