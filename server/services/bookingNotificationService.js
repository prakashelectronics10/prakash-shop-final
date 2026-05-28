const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const NotificationEmail = require("../models/NotificationEmail");
const WebSetting = require("../models/WebSetting");
const env = require("../config/env");
const { normalizeSettings } = require("../utils/webSettings");
const { isEmailConfigured: isEmailProviderConfigured, sendMail } = require("./mailService");
const { notifyBookingCreated: notifyMobileBookingCreated } = require("./mobileNotificationService");

const MAX_EMAIL_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 1500, 5000];
const queue = [];
const queuedBookingIds = new Set();
let processingQueue = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function uniqueEmails(items) {
  return [...new Set(items.map(normalizeEmail).filter(Boolean))];
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function statusLabel(status) {
  return status === "repaired" ? "Repaired" : "Pending";
}

function supportMeta() {
  return {
    supportEmail: String(env.mail?.supportEmail || env.mail?.replyTo || "").trim(),
    supportPhone: String(env.mail?.supportPhone || "").trim(),
    websiteUrl: String(env.mail?.websiteUrl || "").trim(),
  };
}

function supportTextBlock() {
  const meta = supportMeta();
  const lines = [];
  if (meta.supportPhone) lines.push(`Phone: ${meta.supportPhone}`);
  if (meta.supportEmail) lines.push(`Email: ${meta.supportEmail}`);
  if (meta.websiteUrl) lines.push(`Website: ${meta.websiteUrl}`);
  return lines.join(" | ");
}

function supportHtmlBlock() {
  const meta = supportMeta();
  const lines = [];
  if (meta.supportPhone) lines.push(`<span>Phone: ${escapeHtml(meta.supportPhone)}</span>`);
  if (meta.supportEmail) lines.push(`<span>Email: ${escapeHtml(meta.supportEmail)}</span>`);
  if (meta.websiteUrl) lines.push(`<span>Website: ${escapeHtml(meta.websiteUrl)}</span>`);
  if (!lines.length) return "";
  return `
    <div style="margin-top:16px;font-size:12px;color:#475569;line-height:1.6;">
      ${lines.join(" &bull; ")}
    </div>
  `;
}

function emailHeaders(bookingId, type) {
  return {
    "X-Entity-Ref-ID": `booking-${bookingId}-${type}`,
  };
}

function optimizedImageUrl(url = "", width = 360) {
  if (!url.includes("/image/upload/")) return url;
  if (/\/image\/upload\/[^/]*w_\d+/i.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width},c_limit/`);
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #dbeafe;color:#64748b;font-size:13px;width:42%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #dbeafe;color:#0f172a;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(value || "Not provided")}</td>
    </tr>
  `;
}

function bookingProducts(booking) {
  const items = Array.isArray(booking.products)
    ? booking.products.filter((item) => item && item.productName)
    : [];
  if (items.length) return items;
  if (!booking.productName) return [];
  return [{
    productName: booking.productName,
    productCategory: booking.productCategory,
    productImageUrl: booking.productImageUrl,
    quantity: 1,
    price: null,
  }];
}

function productNameSummary(booking) {
  const items = bookingProducts(booking);
  if (!items.length) return booking.repairType || "Repair booking";
  if (items.length === 1) return items[0].productName || booking.repairType || "Repair booking";
  const names = items
    .slice(0, 4)
    .map((item) => `${item.productName}${Number(item.quantity || 1) > 1 ? ` x${item.quantity}` : ""}`)
    .join(", ");
  return `${items.length} products: ${names}${items.length > 4 ? "..." : ""}`;
}

function productCategorySummary(booking) {
  const categories = [...new Set(bookingProducts(booking).map((item) => item.productCategory).filter(Boolean))];
  return categories.join(", ") || booking.productCategory || "";
}

function productTextLines(booking) {
  const items = bookingProducts(booking);
  if (!items.length) return [];
  return ["Products Details:", ...items.map((item, index) => `${index + 1}. ${item.productName}`)];
}

function productCardsBlock(booking) {
  const items = bookingProducts(booking);
  if (!items.length) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
      <tr>
        <td>
          <h3 style="margin:0 0 12px;color:#0f172a;font-size:16px;">Products Details</h3>
          ${items
            .map((item, index) => {
              const image = item.productImageUrl ? optimizedImageUrl(item.productImageUrl, 220) : "";
              const quantity = Number(item.quantity || 1);
              return `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border:1px solid #dbeafe;border-radius:16px;background:#f8fbff;overflow:hidden;">
                  <tr>
                    <td width="92" style="width:92px;padding:10px;vertical-align:top;background:#eff6ff;">
                      ${image
                        ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.productName)}" width="72" height="72" style="display:block;width:72px;height:72px;object-fit:contain;border-radius:12px;background:#ffffff;border:1px solid #bfdbfe;" />`
                        : `<div style="width:72px;height:72px;border-radius:12px;background:#dbeafe;color:#0369a1;line-height:72px;text-align:center;font-size:11px;font-weight:800;border:1px solid #bfdbfe;">No image</div>`
                      }
                    </td>
                    <td style="padding:12px 14px;vertical-align:top;">
                      <div style="display:inline-block;min-width:24px;margin-bottom:6px;border-radius:999px;background:#dbeafe;color:#0369a1;padding:4px 8px;font-size:12px;font-weight:900;">${index + 1}</div>
                      <div style="color:#0f172a;font-size:15px;font-weight:800;line-height:1.35;">${escapeHtml(item.productName)}</div>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
                        <tr>
                          <td style="color:#475569;font-size:12px;line-height:1.45;vertical-align:bottom;">${escapeHtml(item.productCategory || "Product")}</td>
                          <td align="right" style="vertical-align:bottom;">
                            <span style="display:inline-block;border-radius:999px;background:#dbeafe;color:#0369a1;padding:5px 9px;font-size:12px;font-weight:900;white-space:nowrap;">Qty ${quantity}</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              `;
            })
            .join("")}
        </td>
      </tr>
    </table>
  `;
}

async function getBrandAssets() {
  const settings = await WebSetting.findOne({ key: "global" }).lean().catch(() => null);
  const normalized = normalizeSettings(settings);
  return {
    logoUrl: normalized.appleTouchIcon.url || normalized.favicon.url || normalized.ogImage.url || "",
    ogImageUrl: normalized.ogImage.url || "",
  };
}

async function getAdminNotificationRecipients() {
  const configured = await NotificationEmail.find({}).select("email isEnabled").lean();
  const admins = await Admin.find({ isActive: true }).select("email").lean();
  const disabled = new Set(configured.filter((item) => item.isEnabled === false).map((item) => normalizeEmail(item.email)));
  const enabledConfigured = configured
    .filter((item) => item.isEnabled !== false)
    .map((item) => item.email);

  return uniqueEmails([env.adminEmail, ...admins.map((admin) => admin.email), ...enabledConfigured])
    .filter((email) => !disabled.has(email));
}

function isEmailConfigured() {
  return isEmailProviderConfigured();
}

function imagePreviewBlock(booking) {
  const previews = [];
  if (!bookingProducts(booking).length && booking.productImageUrl) {
    previews.push({ label: "Product image", url: optimizedImageUrl(booking.productImageUrl) });
  }
  (booking.images || []).forEach((image, index) => {
    if (image.url) previews.push({ label: `Uploaded image ${index + 1}`, url: optimizedImageUrl(image.url) });
  });
  if (booking.imageUrl) previews.push({ label: "Uploaded image", url: optimizedImageUrl(booking.imageUrl) });

  if (!previews.length) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
      <tr>
        <td>
          <h3 style="margin:0 0 12px;color:#0f172a;font-size:16px;">Image Preview</h3>
          ${previews
            .slice(0, 6)
            .map((item) => `
              <div style="display:inline-block;width:154px;margin:0 10px 12px 0;vertical-align:top;">
                <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.label)}" width="154" style="display:block;width:154px;max-width:154px;height:112px;object-fit:cover;border-radius:14px;border:1px solid #bfdbfe;background:#eff6ff;" />
                <div style="padding-top:6px;color:#64748b;font-size:12px;">${escapeHtml(item.label)}</div>
              </div>
            `)
            .join("")}
        </td>
      </tr>
    </table>
  `;
}

function renderAdminBookingEmail({ booking, logoUrl }) {
  const bookingDate = formatDateTime(booking.requestedAt || booking.createdAt);
  const productName = productNameSummary(booking);
  const productCategory = productCategorySummary(booking);
  const subjectLine = `New booking from ${booking.fullName || "customer"}`;

  return {
    subject: `New Booking Request - ${productName}`,
    text: [
      subjectLine,
      `Customer: ${booking.fullName}`,
      `Phone: ${booking.phoneNumber}`,
      `WhatsApp: ${booking.whatsappNumber}`,
      `Address: ${booking.address}`,
      `Repair/Product: ${productName}`,
      ...productTextLines(booking),
      `Message: ${booking.message || "No message"}`,
      `Booking date: ${bookingDate}`,
      `Status: ${statusLabel(booking.status)}`,
      `Source: ${booking.bookingSource || "manual"}`,
      `Booking ID: ${booking._id}`,
    ].join("\n"),
    html: `
      <div style="margin:0;padding:0;background:#eaf4ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf4ff;padding:24px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;background:#ffffff;border:1px solid #bfdbfe;border-radius:22px;overflow:hidden;box-shadow:0 20px 50px rgba(30,64,175,0.14);">
                <tr>
                  <td style="background:#0f6fdc;padding:26px 28px;color:#ffffff;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:middle;">
                          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" width="52" height="52" alt="Prakash Electronics" style="display:block;border-radius:14px;background:#ffffff;padding:4px;" />` : `<div style="width:52px;height:52px;border-radius:14px;background:#ffffff;color:#0f6fdc;line-height:52px;text-align:center;font-weight:900;">PE</div>`}
                        </td>
                        <td style="padding-left:14px;vertical-align:middle;">
                          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;opacity:.85;">Prakash Electronics</div>
                          <h1 style="margin:4px 0 0;font-size:24px;line-height:1.25;">New Booking Request</h1>
                        </td>
                        <td align="right" style="vertical-align:middle;">
                          <span style="display:inline-block;border-radius:999px;background:#dbeafe;color:#075985;padding:8px 12px;font-size:12px;font-weight:800;">${escapeHtml(statusLabel(booking.status))}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:26px 28px;">
                    <div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:18px;">
                      <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${escapeHtml(productName)}</h2>
                      <p style="margin:0;color:#475569;font-size:14px;">Booking ID: <strong>${escapeHtml(booking._id)}</strong></p>
                    </div>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                      ${row("Customer Name", booking.fullName)}
                      ${row("Phone Number", booking.phoneNumber)}
                      ${row("WhatsApp Number", booking.whatsappNumber)}
                      ${row("Customer Email", booking.customerEmail)}
                      ${row("Location / Address", booking.address)}
                      ${row("Product / Repair Name", productName)}
                      ${row("Product Category", productCategory)}
                      ${row("Booking Message", booking.message || "No message")}
                      ${row("Booking Date / Time", bookingDate)}
                      ${row("Booking Source", booking.bookingSource || "manual")}
                    </table>

                    ${productCardsBlock(booking)}
                    ${imagePreviewBlock(booking)}

                    <div style="margin-top:22px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:18px;padding:16px;color:#1e3a8a;font-size:13px;line-height:1.6;">
                      This notification was generated automatically from the public website booking system. Open the admin panel to update status or contact the customer.
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 28px;background:#f8fbff;color:#64748b;font-size:12px;text-align:center;">
                    Prakash Electronics and Electricals - Professional repair booking notification
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  };
}

function renderCustomerConfirmationEmail({ booking, logoUrl }) {
  const bookingDate = formatDateTime(booking.requestedAt || booking.createdAt);
  const productName = productNameSummary(booking);
  const supportInfo = supportTextBlock();
  return {
    subject: `Booking received - Prakash Electronics`,
    text: [
      `Thank you ${booking.fullName || ""}.`,
      "Your booking request has been received.",
      `Booking ID: ${booking._id}`,
      `Repair/Product: ${productName}`,
      `Booking date: ${bookingDate}`,
      "Our team will contact you soon on your phone or WhatsApp number.",
      supportInfo ? `Support: ${supportInfo}` : "",
    ].filter(Boolean).join("\n"),
    html: `
      <div style="margin:0;padding:0;background:#eaf4ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf4ff;padding:24px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #bfdbfe;border-radius:22px;overflow:hidden;">
                <tr>
                  <td style="background:#0f6fdc;padding:24px;color:#ffffff;text-align:center;">
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" width="58" height="58" alt="Prakash Electronics" style="border-radius:16px;background:#ffffff;padding:4px;" />` : ""}
                    <h1 style="margin:12px 0 0;font-size:24px;">Booking Received</h1>
                    <p style="margin:8px 0 0;opacity:.9;">Thank you for contacting Prakash Electronics.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">We received your booking request. Our team will contact you soon on your phone or WhatsApp number.</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${row("Booking ID", booking._id)}
                      ${row("Repair / Product", productName)}
                      ${row("Booking Date / Time", bookingDate)}
                      ${row("Status", statusLabel(booking.status))}
                    </table>
                    ${supportHtmlBlock()}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 24px;background:#f8fbff;color:#64748b;font-size:12px;text-align:center;">
                    Prakash Electronics and Electricals
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  };
}

function renderRepairCompletedEmail({ booking, logoUrl }) {
  const completedAt = formatDateTime(new Date());
  const productName = productNameSummary(booking);
  const supportInfo = supportTextBlock();
  return {
    subject: `Repair completed - Prakash Electronics`,
    text: [
      `Hello ${booking.fullName || ""},`,
      `Your booking has been marked as repaired/completed.`,
      `Booking ID: ${booking._id}`,
      `Repair/Product: ${productName}`,
      `Completed at: ${completedAt}`,
      "Please contact Prakash Electronics if you need any further help.",
      supportInfo ? `Support: ${supportInfo}` : "",
    ].filter(Boolean).join("\n"),
    html: `
      <div style="margin:0;padding:0;background:#eaf4ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf4ff;padding:24px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #bfdbfe;border-radius:22px;overflow:hidden;">
                <tr>
                  <td style="background:#0f6fdc;padding:24px;color:#ffffff;text-align:center;">
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" width="58" height="58" alt="Prakash Electronics" style="border-radius:16px;background:#ffffff;padding:4px;" />` : ""}
                    <h1 style="margin:12px 0 0;font-size:24px;">Repair Completed</h1>
                    <p style="margin:8px 0 0;opacity:.9;">Your booking has been marked as repaired.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    <div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:18px;margin-bottom:16px;">
                      <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${escapeHtml(productName)}</h2>
                      <p style="margin:0;color:#475569;font-size:14px;">Booking ID: <strong>${escapeHtml(booking._id)}</strong></p>
                    </div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${row("Customer Name", booking.fullName)}
                      ${row("Repair / Product", productName)}
                      ${row("Completed At", completedAt)}
                      ${row("Status", "Repaired")}
                    </table>
                    <p style="margin:18px 0 0;color:#334155;font-size:14px;line-height:1.6;">Thank you for choosing Prakash Electronics and Electricals. If you need any more help, please contact us on phone or WhatsApp.</p>
                    ${supportHtmlBlock()}
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 24px;background:#f8fbff;color:#64748b;font-size:12px;text-align:center;">
                    Prakash Electronics and Electricals
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recipientKey(email) {
  return Buffer.from(normalizeEmail(email)).toString("base64url").slice(0, 96);
}

function appendLog(booking, entry) {
  booking.emailNotification.logs = [
    ...(booking.emailNotification.logs || []),
    {
      at: new Date(),
      ...entry,
    },
  ].slice(-40);
}

function notificationIdempotencyKey(booking, recipient, purpose = "admin") {
  return `booking-${booking._id}-${purpose}-${recipientKey(recipient)}`;
}

async function sendRecipientWithRetry({ booking, recipient, template }) {
  for (let attempt = 1; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        appendLog(booking, { recipient, status: "retrying", attempt });
      }
      const info = await sendMail({
        to: recipient,
        subject: template.subject,
        text: template.text,
        html: template.html,
        replyTo: booking.customerEmail || env.mail?.replyTo || undefined,
        headers: emailHeaders(booking._id, "admin-notification"),
        idempotencyKey: notificationIdempotencyKey(booking, recipient),
        tags: [
          { name: "type", value: "booking_notification" },
          { name: "booking", value: String(booking._id).slice(0, 48) },
        ],
      }, { maxAttempts: 1 });
      appendLog(booking, {
        recipient,
        status: "sent",
        provider: info.provider || "brevo",
        messageId: info.messageId || "",
        attempt,
      });
      return { recipient, ok: true, provider: info.provider || "brevo", messageId: info.messageId || "" };
    } catch (error) {
      if (attempt >= MAX_EMAIL_ATTEMPTS) {
        appendLog(booking, {
          recipient,
          status: "failed",
          error: error.message || "Email delivery failed",
          attempt,
        });
        return { recipient, ok: false, error: error.message || "Email delivery failed" };
      }
      await wait(RETRY_DELAYS_MS[attempt] || 5000);
    }
  }

  return { recipient, ok: false, error: "Email delivery failed" };
}

async function markRecipientsDelivered(recipients) {
  if (!recipients.length) return;
  await NotificationEmail.updateMany(
    { email: { $in: recipients } },
    { $set: { lastDeliveryAt: new Date() } },
  ).catch(() => undefined);
}

async function sendBookingAdminNotification(booking, { uploadFiles = [] } = {}) {
  if (booking.emailNotification?.status === "sent") {
    return { delivered: true, skipped: true };
  }

  booking.emailNotification = {
    ...(booking.emailNotification || {}),
    status: Number(booking.emailNotification?.attempts || 0) > 0 ? "retrying" : "pending",
    attemptedAt: new Date(),
    attempts: Number(booking.emailNotification?.attempts || 0) + 1,
    failedRecipients: [],
    error: "",
  };

  if (!isEmailConfigured()) {
    booking.emailNotification.status = "not_configured";
    booking.emailNotification.error = "Brevo email settings are not configured";
    await booking.save();
    return { delivered: false, reason: "email_not_configured" };
  }

  const recipients = await getAdminNotificationRecipients();
  booking.emailNotification.recipients = recipients;
  if (!recipients.length) {
    booking.emailNotification.status = "not_configured";
    booking.emailNotification.error = "No enabled admin notification recipients";
    await booking.save();
    return { delivered: false, reason: "no_recipients" };
  }

  try {
    const assets = await getBrandAssets();
    const template = renderAdminBookingEmail({ booking, logoUrl: assets.logoUrl });
    const results = await Promise.all(
      recipients.map((recipient) => sendRecipientWithRetry({ booking, recipient, template })),
    );
    const sent = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);

    booking.emailNotification.status = failed.length
      ? sent.length
        ? "partial"
        : "failed"
      : "sent";
    booking.emailNotification.sentAt = sent.length ? new Date() : booking.emailNotification.sentAt;
    booking.emailNotification.messageId = sent.map((item) => item.messageId).filter(Boolean).join(", ");
    booking.emailNotification.provider = sent.map((item) => item.provider).filter(Boolean)[0] || "";
    booking.emailNotification.failedRecipients = failed.map((item) => item.recipient);
    booking.emailNotification.error = failed.map((item) => `${item.recipient}: ${item.error}`).join("; ");
    await booking.save();
    await markRecipientsDelivered(sent.map((item) => item.recipient));
    return { delivered: failed.length === 0, partial: Boolean(sent.length && failed.length), results };
  } catch (error) {
    booking.emailNotification.status = "failed";
    booking.emailNotification.error = error.message || "Email delivery failed";
    appendLog(booking, { status: "failed", error: booking.emailNotification.error, attempt: booking.emailNotification.attempts });
    await booking.save();
    return { delivered: false, reason: "send_failed", error };
  }
}

async function sendCustomerConfirmation(booking) {
  if (!booking.customerEmail) {
    booking.customerConfirmation = {
      ...(booking.customerConfirmation || {}),
      status: "not_requested",
    };
    await booking.save();
    return { delivered: false, reason: "no_customer_email" };
  }

  booking.customerConfirmation = {
    ...(booking.customerConfirmation || {}),
    attemptedAt: new Date(),
    error: "",
  };

  if (!isEmailConfigured()) {
    booking.customerConfirmation.status = "not_configured";
    booking.customerConfirmation.error = "Brevo email settings are not configured";
    await booking.save();
    return { delivered: false, reason: "email_not_configured" };
  }

  try {
    const assets = await getBrandAssets();
    const template = renderCustomerConfirmationEmail({ booking, logoUrl: assets.logoUrl });
    const info = await sendMail({
      to: booking.customerEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
      replyTo: env.mail?.replyTo || undefined,
      headers: emailHeaders(booking._id, "customer-confirmation"),
      idempotencyKey: notificationIdempotencyKey(booking, booking.customerEmail, "customer"),
      tags: [
        { name: "type", value: "booking_confirmation" },
        { name: "booking", value: String(booking._id).slice(0, 48) },
      ],
    });
    booking.customerConfirmation.status = "sent";
    booking.customerConfirmation.sentAt = new Date();
    booking.customerConfirmation.messageId = info.messageId || "";
    booking.customerConfirmation.error = "";
    await booking.save();
    return { delivered: true };
  } catch (error) {
    booking.customerConfirmation.status = "failed";
    booking.customerConfirmation.error = error.message || "Customer confirmation failed";
    await booking.save();
    return { delivered: false, reason: "send_failed", error };
  }
}

async function sendRepairCompletedNotification(booking) {
  if (!booking.customerEmail) {
    booking.repairNotification = {
      ...(booking.repairNotification || {}),
      status: "not_requested",
    };
    await booking.save();
    return { delivered: false, reason: "no_customer_email" };
  }

  if (booking.repairNotification?.status === "sent") {
    return { delivered: true, skipped: true };
  }

  booking.repairNotification = {
    ...(booking.repairNotification || {}),
    attemptedAt: new Date(),
    error: "",
  };

  if (!isEmailConfigured()) {
    booking.repairNotification.status = "not_configured";
    booking.repairNotification.error = "Brevo email settings are not configured";
    await booking.save();
    return { delivered: false, reason: "email_not_configured" };
  }

  try {
    const assets = await getBrandAssets();
    const template = renderRepairCompletedEmail({ booking, logoUrl: assets.logoUrl });
    const info = await sendMail({
      to: booking.customerEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
      replyTo: env.mail?.replyTo || undefined,
      headers: emailHeaders(booking._id, "repair-completed"),
      idempotencyKey: notificationIdempotencyKey(booking, booking.customerEmail, "repair-completed"),
      tags: [
        { name: "type", value: "repair_completed" },
        { name: "booking", value: String(booking._id).slice(0, 48) },
      ],
    });
    booking.repairNotification.status = "sent";
    booking.repairNotification.sentAt = new Date();
    booking.repairNotification.messageId = info.messageId || "";
    booking.repairNotification.provider = info.provider || "brevo";
    booking.repairNotification.error = "";
    await booking.save();
    return { delivered: true };
  } catch (error) {
    booking.repairNotification.status = "failed";
    booking.repairNotification.error = error.message || "Repair completion email failed";
    await booking.save();
    console.error("Repair completion email failed:", {
      bookingId: String(booking._id),
      email: booking.customerEmail,
      error: booking.repairNotification.error,
    });
    return { delivered: false, reason: "send_failed", error };
  }
}

async function notifyBookingCreated(booking, options = {}) {
  await notifyMobileBookingCreated(booking).catch((error) => {
    console.error("Mobile booking notification failed:", {
      bookingId: String(booking._id),
      error: error.message,
    });
  });
  const adminResult = await sendBookingAdminNotification(booking, options);
  await sendCustomerConfirmation(booking);
  return adminResult;
}

function enqueueBookingNotification(bookingOrId) {
  const bookingId = String(bookingOrId?._id || bookingOrId || "");
  if (!bookingId || queuedBookingIds.has(bookingId)) return { queued: false };
  queuedBookingIds.add(bookingId);
  queue.push(bookingId);

  Booking.updateOne(
    { _id: bookingId, "emailNotification.status": { $ne: "sent" } },
    {
      $set: {
        "emailNotification.status": "queued",
        "emailNotification.attemptedAt": new Date(),
      },
      $push: {
        "emailNotification.logs": {
          status: "queued",
          at: new Date(),
          error: "",
        },
      },
    },
  ).catch((error) => {
    console.error("Failed to mark booking email as queued:", { bookingId, error: error.message });
  });

  setImmediate(processEmailQueue);
  return { queued: true };
}

async function processEmailQueue() {
  if (processingQueue) return;
  processingQueue = true;

  try {
    while (queue.length) {
      const bookingId = queue.shift();
      queuedBookingIds.delete(bookingId);
      try {
        const booking = await Booking.findById(bookingId);
        if (!booking) continue;
        await notifyBookingCreated(booking);
      } catch (error) {
        console.error("Booking email queue item failed:", { bookingId, error: error.message });
      }
    }
  } finally {
    processingQueue = false;
    if (queue.length) setImmediate(processEmailQueue);
  }
}

module.exports = {
  enqueueBookingNotification,
  getAdminNotificationRecipients,
  notifyBookingCreated,
  sendRepairCompletedNotification,
  sendBookingAdminNotification,
};
