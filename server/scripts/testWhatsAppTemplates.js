require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { sendTemplateMessage, graphRequest } = require("../services/whatsappCloudApiService");
const env = require("../config/env");

const to = String(process.argv[2] || "").replace(/\D/g, "");
if (!to) {
  console.error("Usage: node scripts/testWhatsAppTemplates.js <10digitOr91number>");
  process.exit(1);
}
const e164 = to.length === 10 ? `91${to}` : to;

async function trySend(label, payload) {
  process.stdout.write(`\n== ${label} ==\n`);
  try {
    const result = await sendTemplateMessage({
      phoneNumberId: env.whatsapp.phoneNumberId,
      accessToken: env.whatsapp.accessToken,
      to: e164,
      ...payload,
    });
    console.log("OK", JSON.stringify(result, null, 2));
  } catch (error) {
    console.log("FAIL", error.message);
    console.log(JSON.stringify(error.payload || {}, null, 2));
  }
}

(async () => {
  // Phone number / WABA health
  try {
    const info = await graphRequest({
      phoneNumberId: env.whatsapp.phoneNumberId,
      accessToken: env.whatsapp.accessToken,
      path: "",
      method: "GET",
      query: { fields: "display_phone_number,verified_name,quality_rating,code_verification_status,is_official_business_account,account_mode,name_status" },
    });
    console.log("phone info", JSON.stringify(info, null, 2));
  } catch (error) {
    console.log("phone info failed", error.message, JSON.stringify(error.payload || {}, null, 2));
  }

  await trySend("pulse_otp_verify", {
    templateName: "pulse_otp_verify",
    languageCode: "en_GB",
    components: [
      { type: "body", parameters: [{ type: "text", text: "123456" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
    ],
  });

  await trySend("booking_confirmation", {
    templateName: "booking_confirmation",
    languageCode: "en",
    components: [
      { type: "body", parameters: [{ type: "text", text: "6adf00testbookingid" }] },
    ],
  });

  await trySend("payment_unsuccessful (no components)", {
    templateName: "payment_unsuccessful",
    languageCode: "en",
    components: [],
  });

  await trySend("order_confirmation", {
    templateName: "order_confirmation",
    languageCode: "en",
    components: [
      { type: "body", parameters: [{ type: "text", text: "PETESTORDER01" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "PETESTORDER01" }] },
    ],
  });

  await trySend("payment_recieved", {
    templateName: "payment_recieved",
    languageCode: "en_US",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: "Test User" },
          { type: "text", text: "Order" },
          { type: "text", text: "Rs. 499" },
          { type: "text", text: "2026-10-26" },
        ],
      },
    ],
  });

  await trySend("order_shipment", {
    templateName: "order_shipment",
    languageCode: "en",
    components: [
      { type: "body", parameters: [{ type: "text", text: "PETESTORDER01" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "PETESTORDER01" }] },
    ],
  });

  await trySend("customer_review", {
    templateName: "customer_review",
    languageCode: "en",
    components: [
      { type: "body", parameters: [{ type: "text", text: "Test User" }] },
    ],
  });
})();
