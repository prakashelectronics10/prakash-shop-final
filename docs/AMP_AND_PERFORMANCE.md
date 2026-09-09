# AMP and performance implementation

## Architecture

The canonical site remains a React 18/Create React App single-page application. Express serves the production build, injects route/product SEO metadata, exposes public catalogue APIs, and owns the MongoDB product models. Cart, checkout, orders, authentication, Razorpay, Pulse AI, and admin routes remain canonical-only because they require unrestricted application JavaScript and/or private state.

AMP is deliberately server-rendered by Express. It does not load the React bundle and it reads the same `ShopProduct` and `ProjectPart` models plus the shared pricing, inventory, public-offer, and product-metadata logic used by the canonical site.

## AMP routes

| Canonical | AMP |
| --- | --- |
| `/products` | `/amp/products` |
| `/wiring-parts` | `/amp/wiring-parts` |
| `/product/:slug-or-id` | `/amp/product/:slug-or-id` |

Only active public products are returned. A missing or inactive AMP product returns HTTP 404 with a valid `noindex, follow` AMP document. The category/catalog AMP pages cap the initial query at 24 lightweight cards; the canonical catalogue keeps search, filters, pagination/incremental loading, cart state, and other interactions.

Canonical HTML receives an absolute `rel="amphtml"` link for the mapped routes. Every AMP document points back to one absolute canonical production URL. AMP URLs are intentionally not added to the main sitemap: canonical pages remain the indexing authority, while search crawlers discover AMP through the canonical `amphtml` relationship.

## Content, prices, stock, and checkout

Product AMP pages include current product name, gallery, description, MRP/selling price, discount, availability, public offer, SKU/brand/model/GTIN/MPN when present, specifications, warranty, delivery information, breadcrumbs, and Product/Offer/Breadcrumb structured data. No rating or review data is fabricated.

AMP responses use a two-minute shared cache with ten-minute stale-while-revalidate. This matches the public catalogue API policy closely enough to avoid permanently stale commerce information. The CTA transfers to the exact canonical product URL; add-to-cart, private coupons, customer state, checkout, and payment stay in the secure canonical application.

There is no GA4/third-party page-view tag in the current public frontend, so `amp-analytics` is intentionally not loaded. Add it only when a real measurement ID and matching consent/event policy exist, to avoid duplicate tracking.

## Performance changes

- AMP pages reserve image space with `amp-img`, use responsive layouts, and contain no custom JavaScript or React bundle.
- Canonical route components already use route/section code splitting, responsive optimized images, deferred below-the-fold sections, catalogue pagination/incremental loading, immutable hashed-asset caching, compression, and short public API caching.
- The Recent Updates CTA now uses one opaque CSS gradient and explicitly disables backdrop blur/filtering, reducing paint work and removing the reported visual glitch.
- The product-detail cart shortcut now measures the existing WhatsApp/Pulse AI action stack instead of forcing a bottom position, preventing the cart CTA from covering Pulse AI.
- AMP runtime loading is allowed by the server CSP; no other AMP component scripts are loaded because the templates do not require them.

## Build and validation

Run:

```bash
npm test -- --watchAll=false --runInBand
npm --prefix server test
npm --prefix server run validate:amp
npm run build
```

After starting the production server with a connected database, validate representative URLs:

```text
https://validator.ampproject.org/#url=https%3A%2F%2Fwww.prakashshop.in%2Famp%2Fproducts
https://validator.ampproject.org/#url=https%3A%2F%2Fwww.prakashshop.in%2Famp%2Fwiring-parts
https://validator.ampproject.org/#url=https%3A%2F%2Fwww.prakashshop.in%2Famp%2Fproduct%2FREAL_PRODUCT_SLUG
```

The server test suite also checks the mandatory AMP shell, boilerplate, canonical links, structured data, `amp-img` usage, absence of the React bundle, and 404 robots behavior. `validate:amp` runs the official AMP validator against representative output from every reusable template. It downloads the current validator rules, so it needs network access. Production should continue serving through Express (the Render configuration already does); a static-only Netlify/Vercel rewrite cannot generate the database-backed AMP routes.

For production verification, inspect response status/cache headers and run PageSpeed Insights or Lighthouse on the homepage, both catalogues, a canonical product, and its AMP counterpart. Confirm the canonical page exposes exactly one `amphtml` link and the AMP page exposes exactly one matching canonical link.
