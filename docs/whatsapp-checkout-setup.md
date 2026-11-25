# WhatsApp AI media and checkout setup

The implementation accepts captionless images, transcribes supported voice messages, collects delivery details, builds a server-priced order review, and confirms prepaid orders only after a verified Razorpay payment. COD is separately enabled per WhatsApp account in **Manage WhatsApp → AI replies → Allow cash on delivery**. COD defaults off and remains payment-due, not paid.

## Activate the Pay now card

The requested screenshot corresponds to Meta **Enhanced Payment Links**. The implementation sends an approved WhatsApp template with exactly one dynamic Razorpay URL button. It does not paste payment URLs into customer replies or silently fall back to a browser-link message.

1. Ask Meta or your WhatsApp Solution Partner to enable **Enhanced Payment Links** for your WhatsApp Business/Messaging account. Provide the account ID, Razorpay as gateway, and a real production sample payment link. Template approval alone does not enable enhanced rendering.
2. In WhatsApp Manager, create this template:
   - Name: `pulse_order_payment`
   - Category: **Utility**
   - Language: **English (`en`)**
   - Header: **None**
   - Body: `Hi {{1}}, your Prakash Electronics order {{2}} is awaiting payment. Amount: INR {{3}}. Tap Pay now to pay. We will confirm your order after payment is verified.`
   - Example body values: `Rahul`, `PEABC234XYZ`, `300.00`
   - Exactly one button: **Visit website**, label **Pay now**, URL type **Dynamic**
   - URL: `https://rzp.io/rzp/{{1}}`
   - Supply an actual sample Razorpay link when Meta asks for the example URL. If your Razorpay account generates `/i/` links, use `https://rzp.io/i/{{1}}` instead. The prefix must match the generated link; custom domains are not supported.
3. Wait for approval. The server checks template name, language, approval status, Utility category, header absence, body variables, and button prefix before creating a new prepaid order.
4. In **Manage WhatsApp → AI replies → WhatsApp payment card**, enter the approved name/language and turn on **Enhanced Payment Links activated** only after Meta confirms activation. Save AI settings.
5. Use live Razorpay credentials for the native payment-card acceptance check. Enhanced rendering requires production payment links and supported recipient WhatsApp versions.

On supported clients, UPI may switch to the selected UPI app for authorization. Card/net-banking/wallet payment uses an in-app checkout/browser. The application cannot force a browser-free experience for every payment method or an unsupported WhatsApp version.

Official reference: [Meta Enhanced Payment Links](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/enhanced-payment-links).

## Razorpay verification

- Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and **`RAZORPAY_WEBHOOK_SECRET`** on the backend.
- In Razorpay Dashboard, add/update the webhook URL to `https://<your-backend-domain>/api/orders/webhook` and use the same webhook secret.
- Subscribe to **`payment_link.paid`**; preserve existing `payment.captured`, `refund.processed`, and `refund.failed` subscriptions used by website orders.
- The server verifies the signature on the raw request body, link ID, internal reference, INR currency, full amount, provider order association, and captured payment state. Screenshots, customer claims, authorization-only status and partial payments cannot confirm an order.
- The **Check payment** button also fetches the link and captured payment from Razorpay if the webhook is delayed. Repeated confirmation taps reuse the order and payment link. An unpaid link can be cancelled before restarting checkout.
- Production creates the unique checkout index explicitly, because this project disables Mongoose auto-indexing in production. Index creation failure blocks checkout creation.

Official reference: [Razorpay payment-link webhooks](https://github.com/razorpay/markdown-docs/blob/master/webhooks/payment-links.md).

## Media and customer details

- Uses the existing Gemini API key and WhatsApp account access token. Media is downloaded server-side from Meta with authentication, a timeout and a 12 MB limit. Base64 media and tokens are not persisted in messages.
- Voice transcripts are saved to the incoming message for inbox/history; AI responds in text. Unclear, unsupported, oversized or unavailable media prompts the customer to retry or type.
- Required details: full name, Indian phone number, complete address, six-digit pincode. Landmark and delivery note are optional, matching the supplied checkout screenshot.
- A customer reviews the product/variant, quantity, delivery details, discounts and additional charges before choosing online payment or confirming COD. Prices/stock/variants are revalidated on confirmation. A changed price requires a fresh review.
- Human takeover, per-conversation AI pause and account AI disable continue to suppress automated replies.

## Verification before enabling live checkout

Automated tests cover vision input, voice transcription/history, media boundaries, payment-template structure, duplicate submissions, stale review buttons, fresh COD settings, amount changes, and signed webhook verification. Run:

```powershell
node --test server/tests/whatsappCheckout.test.js server/tests/whatsappMedia.test.js server/tests/whatsappAIIntegration.test.js server/tests/whatsappPaymentRequest.test.js server/tests/orderPayment.test.js
npm run build
```

Then use the actual connected WhatsApp account to check native card rendering and a deliberate merchant-approved live payment: pending before payment, confirmed after the signed provider event, and the correct WhatsApp confirmation. This live acceptance check has not been performed by this implementation session.

Inspection in this session found no compatible payment-request template on the environment-configured WhatsApp account, and the local Razorpay webhook secret was missing. No template was submitted, no payment was initiated, and no customer message was sent during inspection.
