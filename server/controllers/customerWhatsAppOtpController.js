const asyncHandler = require("../utils/asyncHandler");
const {
  getCustomerOtpDelivery,
  sendCustomerWhatsAppOtp,
  verifyCustomerWhatsAppOtp,
} = require("../services/customerWhatsAppOtpService");

exports.getWhatsAppOtpDelivery = asyncHandler(async (req, res) => {
  const status = await getCustomerOtpDelivery(req.body);
  res.set("Cache-Control", "no-store").json({ success: true, data: { status } });
});

exports.sendWhatsAppOtp = asyncHandler(async (req, res) => {
  const result = await sendCustomerWhatsAppOtp({
    whatsappNumber: req.body.whatsappNumber || req.body.phone,
    purpose: req.body.purpose,
    customerName: req.body.customerName || req.body.fullName || "",
    resendChallengeId: req.body.challengeId || "",
  });
  res.json({ success: true, data: result });
});

exports.verifyWhatsAppOtp = asyncHandler(async (req, res) => {
  const result = await verifyCustomerWhatsAppOtp({
    challengeId: req.body.challengeId,
    otp: req.body.otp,
    whatsappNumber: req.body.whatsappNumber || req.body.phone,
    purpose: req.body.purpose,
  });
  res.json({ success: true, data: result });
});
