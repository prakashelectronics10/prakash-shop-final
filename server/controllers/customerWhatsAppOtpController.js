const asyncHandler = require("../utils/asyncHandler");
const {
  sendCustomerWhatsAppOtp,
  verifyCustomerWhatsAppOtp,
} = require("../services/customerWhatsAppOtpService");

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
