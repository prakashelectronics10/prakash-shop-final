require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const CustomerWhatsAppOtp = require("../models/CustomerWhatsAppOtp");
const WhatsAppMessage = require("../models/WhatsAppMessage");
const { sendCustomerWhatsAppOtp } = require("../services/customerWhatsAppOtpService");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const otps = await CustomerWhatsAppOtp.find({})
    .sort({ createdAt: -1 })
    .limit(8)
    .select("whatsappNumber purpose createdAt verifiedAt usedAt attempts expiresAt")
    .lean();
  console.log("recent otps", JSON.stringify(otps, null, 2));

  const msgs = await WhatsAppMessage.find({
    $or: [
      { "meta.kind": { $in: ["otp", "booking_confirmation", "order_confirmation", "payment_unsuccessful", "payment_received"] } },
      { "meta.transactional": true },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("direction type text meta createdAt customerWaId status")
    .lean();
  console.log("recent transactional msgs", JSON.stringify(msgs, null, 2));

  const testNumber = process.argv[2];
  if (testNumber) {
    console.log("Sending live OTP to", testNumber);
    try {
      const result = await sendCustomerWhatsAppOtp({
        whatsappNumber: testNumber,
        purpose: "booking",
        customerName: "Debug Test",
      });
      console.log("OTP send result", result);
    } catch (error) {
      console.error("OTP send failed", error.message, error.payload || error);
    }
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_e) { /* ignore */ }
  process.exit(1);
});
