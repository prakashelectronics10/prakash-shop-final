# Google Merchant readiness

Implemented in the application:

- Stable canonical product URLs at `/product/{slug}`; legacy `/product-detail/{slug-or-id}` URLs continue to render and canonicalize to the new route.
- Server-rendered product title, description, canonical, Open Graph metadata, Product JSON-LD, Offer data, and BreadcrumbList.
- Dynamic `/sitemap.xml`, controlled `/robots.txt`, and `/google-merchant-feed.xml` generated from active, purchasable catalogue records.
- Shared catalogue price and inventory helpers power product pages, checkout, structured data, and the Merchant feed.
- Admin fields for SKU, brand, GTIN, MPN, manufacturer, model, condition, product type, Google category, warranty, package data, shipping copy, specifications, gallery images, and SEO copy.
- Product gallery thumbnails, descriptive image alt text, keyboard-operable fullscreen viewer, and responsive product-information sections.
- Shipping and Return & Refund policy pages, footer links, and pre-shipping cancellation requests with admin approval and Razorpay refund initiation.

Before Merchant Center submission, the administrator must:

1. Review every active product in Admin and add accurate brand, condition, description, product type, Google category, and high-quality product images.
2. Add GTIN and MPN only when issued by the manufacturer. Never create or guess them. The feed explicitly sends `identifier_exists=no` when neither GTIN nor a real brand/MPN pair exists.
3. Confirm that website price, stock, delivery charge, service area, and delivery estimate match the checkout experience.
4. Open `https://www.prakashshop.in/google-merchant-feed.xml` after deployment and use that URL as the Merchant Center data source.
5. Submit `https://www.prakashshop.in/sitemap.xml` in Google Search Console and inspect several `/product/{slug}` URLs.
6. Validate representative product pages with Google Rich Results Test and Merchant Center diagnostics.
7. Review business identity, contact details, policy wording, and Razorpay webhook configuration in production.

The feed intentionally excludes records without a positive price, available stock, a stable identifier, or a product image. This prevents incomplete catalogue data from being advertised.
