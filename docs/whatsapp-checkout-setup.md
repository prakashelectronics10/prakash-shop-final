# WhatsApp AI media and checkout setup

The implementation accepts captionless images, transcribes supported voice messages, collects delivery details, builds a server-priced order review, and confirms prepaid orders only after a verified Razorpay payment. COD is separately enabled per WhatsApp account in **Manage WhatsApp → AI replies → Allow cash on delivery**. COD defaults off and remains payment-due, not paid.

## Order details card

Online checkout uses the approved English template `order_details_with_product_list` (ID `1468551722067479`). Its header shows the first available product image. Its Review and Pay button opens the itemized INR order and its Razorpay payment link. Configure the linked Meta catalog and sync the products and variants with their retailer IDs. Enable the payment card for the account in Manage WhatsApp after payment links are activated.

## Repair bookings

Send REPAIR to begin. The customer supplies booking details, adds up to eight photos, and sends CONFIRM to submit. The booking enters the regular admin booking list, email queue and mobile notification flow.

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
