const env = require("../../../config/env");
const { escapeHtml, renderEmailLayout } = require("./baseTemplate");

function otpActionLabel(purpose) {
  if (purpose === "admin-create-new") return "confirming your new admin account";
  if (purpose === "admin-create") return "creating a new admin";
  if (purpose === "password-reset") return "resetting your password";
  return "logging in";
}

function otpSubject(purpose) {
  if (purpose === "admin-create-new") return "Verify your new Prakash Admin account";
  if (purpose === "admin-create") return "Confirm Prakash Admin creation";
  if (purpose === "password-reset") return "Prakash account password reset OTP";
  return "Prakash Admin login OTP";
}

function renderOtpEmail({ otp, purpose, expiresMinutes }) {
  const action = otpActionLabel(purpose);
  const brandName = env.mail.fromName || "Prakash Electronics";
  const safeOtp = escapeHtml(otp);

  return {
    subject: otpSubject(purpose),
    text: [
      `Your ${brandName} OTP is ${otp}.`,
      `Use this code only for ${action}.`,
      `It expires in ${expiresMinutes} minutes.`,
      "If you did not request this, ignore this email and review admin access immediately.",
    ].join("\n"),
    html: renderEmailLayout({
      title: "Admin Verification",
      preheader: `Your OTP expires in ${expiresMinutes} minutes.`,
      body: `
        <p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.7;">Use this one-time password for ${escapeHtml(action)}.</p>
        <div style="margin:20px 0;padding:18px;border-radius:18px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#1d4ed8;font-weight:700;">Verification Code</div>
          <div style="margin-top:10px;font-size:34px;line-height:1;font-weight:900;letter-spacing:7px;color:#0f172a;">${safeOtp}</div>
        </div>
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">This code expires in <strong>${expiresMinutes} minutes</strong>. Never share this code with anyone.</p>
        <p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.6;">If you did not request this, ignore this email and review admin access immediately.</p>
      `,
    }),
  };
}

module.exports = { renderOtpEmail };
