# Render Deployment

This project deploys as one Render Web Service. The React app builds into `build/`, and the Express server in `server/` serves both `/api/*` and the built frontend.

## Local Build Check

Run from the project root:

```powershell
npm.cmd install
npm.cmd --prefix server install
$env:REACT_APP_API_URL="/api"; npm.cmd run build
```

## Render Settings

Use the included `render.yaml`, or create the service manually with these values:

```text
Runtime: Node
Root Directory: blank
Branch: main
Build Command: npm ci && npm --prefix server ci && npm run build
Start Command: npm --prefix server start
Health Check Path: /api/health
```

The server starts listening before the MongoDB handshake finishes, so Render health checks and fallback public content can respond quickly during cold starts. Render free instances can still sleep; use a paid/always-on instance if you need to remove the platform wake-up screen entirely.

## Required Environment Variables

Set these in Render, not in committed files:

```text
NODE_ENV=production
PRODUCTION_DOMAIN=prakashshop.in
PRODUCTION_URL=https://prakashshop.in
FRONTEND_URL=https://prakashshop.in
REACT_APP_API_URL=/api
GENERATE_SOURCEMAP=false
MONGODB_URI=<mongodb-atlas-uri>
JWT_SECRET=<long-random-secret-32-plus-chars>
CORS_ORIGINS=https://prakashshop.in,https://www.prakashshop.in
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
ADMIN_SESSION_BIND_IP=false
GEMINI_API_KEY=<gemini-key>
GEMINI_MODEL=gemini-2.5-flash
CLOUDINARY_CLOUD_NAME=<cloudinary-cloud>
CLOUDINARY_API_KEY=<cloudinary-key>
CLOUDINARY_API_SECRET=<cloudinary-secret>
CLOUDINARY_FOLDER=prakash-electronics
GOOGLE_MAPS_API_KEY=<optional-google-maps-key>
RAZORPAY_KEY_ID=<rzp_live_or_test_key_id>
RAZORPAY_KEY_SECRET=<matching-secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-signing-secret>
```

Create the Razorpay API keys in the Razorpay dashboard. Use test keys while validating checkout, then replace both values together with live keys for production. Add `https://prakashshop.in/api/orders/webhook` as a Razorpay webhook subscribed to `payment.captured`, and use its signing secret for `RAZORPAY_WEBHOOK_SECRET`. Never expose either secret through a `REACT_APP_*` variable; payment signatures are verified only by the Express server.

Use Brevo Transactional Email API for all production email. Do not configure legacy mail transport variables.

```text
BREVO_ENABLED=true
BREVO_API_KEY=<brevo-api-key>
BREVO_FROM_EMAIL=notifications@prakashshop.in
BREVO_FROM_NAME=Prakash Electronics
MAIL_REPLY_TO=<support-or-owner-email>
MAIL_SUPPORT_EMAIL=<support-or-owner-email>
MAIL_SUPPORT_PHONE=<support-phone>
MAIL_WEBSITE_URL=https://prakashshop.in
```

Before using `notifications@prakashshop.in`, verify the sender/domain in Brevo and add the DNS records Brevo gives you. Public Gmail/Yahoo sender addresses should not be used for production delivery.

For Google Maps, restrict the browser key to `https://prakashshop.in/*` and `https://www.prakashshop.in/*`. The site accepts Google iframe embed URLs and also cleans pasted iframe snippets from the admin panel.

## First Admin

Temporarily add these Render env vars:

```text
ADMIN_EMAIL=<owner-email>
ADMIN_PASSWORD=<12-plus-char-password>
```

Then run this one-off command in Render Shell:

```bash
npm --prefix server run create-admin
```

Remove `ADMIN_PASSWORD` after the admin is created.

## Verify

Open these after deployment:

```text
https://<render-service-name>.onrender.com/api/health
https://<render-service-name>.onrender.com/
https://<render-service-name>.onrender.com/admin/login
```

Also test admin OTP, create-admin OTP, a booking with images, booking notification retry, Cloudinary image upload, map rendering, one successful Razorpay test payment, customer Order ID tracking, and an order-status update from the admin Orders section.
