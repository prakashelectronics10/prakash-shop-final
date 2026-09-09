function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compact(value, max = 3000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function periodLabel(hours) {
  if (Number(hours) === 24) return "24 hours";
  if (Number(hours) === 720) return "30 days";
  return "7 days";
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="width:42%;padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(value || "Not available")}</td>
    </tr>
  `;
}

function imageBlock(images = []) {
  if (!images.length) return "";
  return `
    <div style="margin-top:20px;">
      <h3 style="margin:0 0 10px;color:#0f172a;font-size:15px;">Relevant customer uploads</h3>
      <div style="font-size:0;">
        ${images.slice(0, 5).map((image, index) => `
          <div style="display:inline-block;width:164px;margin:0 10px 12px 0;vertical-align:top;font-size:12px;">
            <img src="${escapeHtml(image.url)}" alt="Customer upload ${index + 1}" width="164" style="display:block;width:164px;height:118px;object-fit:cover;border:1px solid #dbeafe;border-radius:12px;background:#eff6ff;" />
            <div style="padding-top:5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(image.name || `Uploaded image ${index + 1}`)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPulseAIUnavailableDemandEmail({
  requestedItem,
  demandType = "product",
  reason,
  uniqueCustomerCount = 0,
  trackingPeriodHours = 168,
  recentExamples = [],
  firstDetectedAt,
  latestDetectedAt,
  images = [],
  model,
  logoUrl,
} = {}) {
  const item = compact(requestedItem, 160) || "Unlisted electrical request";
  const type = demandType === "service" ? "Service" : "Product";
  const period = periodLabel(trackingPeriodHours);
  const examples = recentExamples.slice(0, 6).map((example) => ({
    query: compact(example.query, 700) || "Image-only request",
    detectedAt: formatDateTime(example.detectedAt),
  }));
  const subject = `Pulse AI demand trend: ${item} (${uniqueCustomerCount} customers)`;
  const text = [
    "PULSE AI - VERIFIED UNAVAILABLE DEMAND TREND",
    `${uniqueCustomerCount} unique customers requested an unavailable electrical/electronics ${demandType}.`,
    "",
    `Requested ${type.toLowerCase()}: ${item}`,
    `Unique customer demand: ${uniqueCustomerCount}`,
    `Tracking period: ${period}`,
    `First detected: ${formatDateTime(firstDetectedAt)}`,
    `Latest detected: ${formatDateTime(latestDetectedAt)}`,
    `Catalog result: ${compact(reason, 500) || "No exact active catalog match was available."}`,
    model ? `Pulse AI model: ${compact(model, 100)}` : "",
    images.length ? `${images.length} relevant customer image(s) included.` : "No customer images were available.",
    examples.length ? "\nRecent example queries:" : "",
    ...examples.map((example, index) => `${index + 1}. ${example.query} — ${example.detectedAt}`),
  ].filter(Boolean).join("\n");

  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(uniqueCustomerCount)} customers requested ${escapeHtml(item)} within ${escapeHtml(period)}.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:22px 10px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border:1px solid #dbeafe;border-radius:18px;background:#ffffff;overflow:hidden;box-shadow:0 10px 28px rgba(15,23,42,.06);">
              <tr><td style="padding:22px 24px;background:#0f2744;color:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="vertical-align:middle;">
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Prakash Electronics" width="38" height="38" style="display:block;width:38px;height:38px;object-fit:contain;border-radius:10px;background:#ffffff;" />` : `<div style="width:38px;height:38px;border-radius:10px;background:#dbeafe;color:#0f2744;text-align:center;line-height:38px;font-size:13px;font-weight:900;">PE</div>`}
                  </td>
                  <td style="width:100%;padding-left:12px;vertical-align:middle;">
                    <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#93c5fd;">Pulse AI demand intelligence</div>
                    <div style="margin-top:4px;font-size:19px;font-weight:800;line-height:1.25;">Unavailable demand reached your alert threshold</div>
                  </td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:22px 24px;">
                <div style="padding:15px 16px;border:1px solid #bfdbfe;border-radius:14px;background:#f8fbff;">
                  <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#0369a1;">${escapeHtml(type)} opportunity</div>
                  <div style="margin-top:5px;color:#0f172a;font-size:18px;font-weight:800;line-height:1.35;">${escapeHtml(item)}</div>
                  <div style="margin-top:6px;color:#64748b;font-size:12px;line-height:1.5;">${escapeHtml(compact(reason, 500) || "No exact active catalog match was available.")}</div>
                </div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                  ${detailRow("Unique customers/users", String(uniqueCustomerCount))}
                  ${detailRow("Selected tracking period", period)}
                  ${detailRow("First detected", formatDateTime(firstDetectedAt))}
                  ${detailRow("Latest detected", formatDateTime(latestDetectedAt))}
                  ${model ? detailRow("Pulse AI model", compact(model, 100)) : ""}
                </table>

                ${examples.length ? `
                  <div style="margin-top:20px;">
                    <div style="margin-bottom:8px;color:#64748b;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;">Recent example customer queries</div>
                    ${examples.map((example, index) => `
                      <div style="margin-top:8px;padding:11px 13px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
                        <div style="color:#1e293b;font-size:13px;line-height:1.55;">${index + 1}. ${escapeHtml(example.query)}</div>
                        <div style="margin-top:4px;color:#94a3b8;font-size:11px;">${escapeHtml(example.detectedAt)}</div>
                      </div>
                    `).join("")}
                  </div>
                ` : ""}

                ${imageBlock(images)}
                <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.6;">This notification is aggregated from unique anonymous customer identities. Repeated messages from the same customer are counted once within the selected rolling period.</p>
              </td></tr>
              <tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:11px;line-height:1.5;">Automated catalog-opportunity alert from Prakash Electronics Pulse AI. Unrelated non-electrical requests are excluded.</td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
  `;
  return { subject, text, html };
}

module.exports = { escapeHtml, periodLabel, renderPulseAIUnavailableDemandEmail };
