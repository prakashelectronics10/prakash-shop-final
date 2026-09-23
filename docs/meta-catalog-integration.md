# Meta Commerce Manager Catalog integration

## Architecture

Prakashshop's MongoDB remains the source of truth.

```text
Admin product write -> MongoDB product -> MongoDB Meta sync job -> Meta Catalog -> connected WhatsApp Business Account
```

Shop products and wiring accessories both participate. A product write succeeds after the website data is saved and a local outbox job is scheduled; it does not wait for Meta. The worker loads the latest product state when it runs, so coalesced edits converge instead of replaying stale payloads.

The stable local `sku` is Meta's `retailer_id` and later WhatsApp's `product_retailer_id`. Existing records without a SKU receive a deterministic SKU based on their immutable MongoDB `_id`. Once assigned, the CRUD controllers preserve it when titles and slugs change.

## Verified Meta API contract

This implementation was verified on 16 September 2026 against Graph API `v26.0` and Meta's current generated Business SDK definitions:

- `POST /{catalog-id}/products` creates or updates a Product Item. `allow_upsert=true` and `retailer_id` provide idempotency.
- `DELETE /{product-item-id}` deletes a Product Item. If a legacy local record has no stored Meta item ID, the client resolves it through `GET /{catalog-id}/products` using `retailer_id` first.
- `GET /{catalog-id}/products?fields=id,retailer_id&limit=1` verifies that the configured catalog is readable through the same Catalog API surface used by product synchronization. It deliberately does not request the catalog's `business` field.
- Product prices and sale prices are unsigned integers in the currency's minor unit. INR values are converted from rupees to paise (`2499` -> `249900`) and sent with `currency=INR`.
- Supported values used here are `in stock` / `out of stock`, `new` / `refurbished` / `used`, and `published` / `staging`.
- Public product and image URLs must be HTTPS. Localhost, loopback, filesystem, and HTTP URLs are rejected before transmission.

Primary references:

- [Meta Python Business SDK ProductCatalog definition](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/productcatalog.py)
- [Meta Python Business SDK ProductItem definition](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/productitem.py)
- [Meta Catalog business asset management](https://developers.facebook.com/docs/marketing-api/business-asset-management/guides/catalog)
- [Meta Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog)
- [WhatsApp catalog messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/sell-products-and-services)

The Graph version is configured once through `META_GRAPH_API_VERSION`; no endpoint has a hard-coded version.

## Field mapping

| Website | Meta Product Item |
| --- | --- |
| `sku` | `retailer_id` |
| `name` | `name` |
| `description` or `shortDescription` | `description` |
| selling price | `price`, or `sale_price` when below MRP |
| MRP when greater than selling price | `price` |
| `quantity` / `stock` and availability | `availability`, `inventory` |
| `imageUrl` | `image_url` |
| unique gallery images | `additional_image_urls` |
| canonical `/product/{slug}` URL | `url` |
| `brand` or real manufacturer/brand fallback | `brand` |
| `condition` | `condition` |
| real `gtin` | `gtin` |
| real `mpn` | `manufacturer_part_number` |
| `productType` or category | `product_type` |
| `isActive` | `published` / `staging` visibility |

No GTIN, EAN, UPC, or MPN is fabricated. The project currently has no variant model, so no artificial Meta variants are created.

## Outbox and retry behavior

`MetaCatalogSyncJob` records contain the source model, product ID, retailer ID, operation, status, attempt count, sanitized error, revision, and next retry time. `UPSERT` jobs have a stable key per local product. Scheduling another edit increments the revision and resets the job to pending. A worker completing an older revision cannot mark a newer edit as synchronized.

The worker runs every 15 seconds by default with concurrency 2. Retryable network, timeout, rate-limit, and Meta 5xx failures use exponential backoff for at most five attempts. Authentication, configuration, permission, and validation errors fail without an infinite loop. Manual retry queues the current database state.

Delete jobs retain `retailer_id` and Meta item ID before the product record and Cloudinary images are removed. This prevents permanent local deletion from losing the information needed by Meta.

## Admin operations

The main owner sees the following controls in Shop Products and Wiring Accessories:

- **Test connection** — checks the configured catalog without returning the token.
- **Sync all products** — queues every existing product. It does not launch uncontrolled parallel requests.
- **Meta: Synced / Pending / Syncing / Failed** — per-product status.
- **Retry sync** — queues the latest local state for a failed or unsynchronized product.
- **Retry failed** — requeues failed upserts and retained delete jobs after credentials, permissions, or data are corrected.

All control endpoints are cookie-authenticated, main-owner-only, rate-limited, and mounted below `/api/admin`. Product errors shown in the admin are sanitized. Access tokens and Authorization headers are redacted by the logger and never included in API responses.

## Environment variables

Required backend variables:

```env
META_GRAPH_API_VERSION=v26.0
META_CATALOG_ID=
META_ACCESS_TOKEN=
```

Optional worker tuning:

```env
META_REQUEST_TIMEOUT_MS=15000
META_SYNC_WORKER_INTERVAL_MS=15000
META_SYNC_MAX_ATTEMPTS=5
META_SYNC_CONCURRENCY=2
```

`META_BUSINESS_ID` is not required by runtime product synchronization. It is useful only during manual asset discovery/assignment. `META_WABA_ID` is also not required because connecting the catalog to a WhatsApp Business Account is an asset configuration step in Meta, not part of product CRUD.

Never use a `REACT_APP_` prefix for any Meta secret. Store the token only in `server/.env` locally and in the backend host's secret environment settings in production.

## Manual Meta setup

Meta changes dashboard wording periodically; the current Business Portfolio, Data Sources, System Users, Commerce Manager, and WhatsApp Accounts labels are used below.

### 1. Confirm or create the Business Portfolio

1. Open [Meta Business Suite](https://business.facebook.com/) and use the portfolio selector at the upper left.
2. Choose the Business Portfolio that owns Prakash Electronics assets. If none exists, open **Settings > Business settings** and create a portfolio.
3. In **Business settings > Business info**, confirm the portfolio name and ownership. The displayed Business Portfolio ID is the optional business ID; the app does not need it at runtime.

### 2. Create and connect the Meta developer app

1. Open [Meta for Developers > My Apps](https://developers.facebook.com/apps/) and select **Create App**.
2. Choose the current business-oriented use case (Meta may label it **Other > Business** or offer a business asset management use case).
3. Connect the app to the same Business Portfolio in the app's **Settings > Basic** / business verification area.
4. Add the products/capabilities needed to manage business assets and catalogs. This server does not need Facebook Login or WhatsApp messaging merely to synchronize products.

For a first-party app and assets your own business owns, use a System User token. If the app will manage catalogs for unrelated client businesses, Meta App Review and Advanced Access may also be required.

### 3. Create or select the Commerce Manager catalog

1. Open [Commerce Manager](https://business.facebook.com/commerce/).
2. Select **Add catalog** (or select the existing Prakash Electronics catalog), choose **E-commerce / Products**, and assign the correct Business Portfolio as owner.
3. Open the catalog and go to **Settings**. Copy the **Catalog ID** shown in catalog details.
4. Save that numeric value as `META_CATALOG_ID` on the backend host.
5. In **Business settings > Data sources > Catalogs**, select the catalog and verify that the correct Business Portfolio owns it.

Use this same catalog for WhatsApp; do not create a duplicate WhatsApp-only catalog.

### 4. Create and authorize a System User

1. In **Business settings**, open **Users > System users**.
2. Add a System User for the Prakashshop server. An **Admin** System User is simplest during initial setup; least-privilege asset assignment is still required.
3. Select the System User, choose **Assign assets**, then **Data sources > Catalogs**.
4. Select the Prakash Electronics catalog and grant **Manage catalog** (`MANAGE`) access. Advertising access is unnecessary for this sync unless catalog ads are also being operated.
5. Ensure the developer app is also owned by or shared with this Business Portfolio.

### 5. Generate the server token

1. Still under **Users > System users**, select the server System User.
2. Choose **Generate new token**.
3. Select the Meta developer app connected above.
4. Choose the supported long-lived/permanent System User token option and request `catalog_management`.
5. Do not request `business_management` for this integration. It is relevant only to separate Business Portfolio discovery or administration tooling, which this application does not implement. Direct product CRUD against the assigned catalog uses `catalog_management` plus the catalog's `MANAGE` asset task.
6. Generate and copy the token once, then store it only as `META_ACCESS_TOKEN` in `server/.env` or the Render secret environment field.

Never paste the real token into chat, frontend code, GitHub, screenshots, support tickets, or a `REACT_APP_...` variable.

### 6. Configure the Graph version

Set:

```env
META_GRAPH_API_VERSION=v26.0
```

Before a future Meta version upgrade, review the Graph API changelog, run this project's mocked tests, then use **Test connection** and a single test product before bulk synchronization.

### 7. Connect the catalog to WhatsApp Business

1. In **Business settings**, open **Accounts > WhatsApp accounts** and select the correct WhatsApp Business Account (WABA).
2. Open its asset/catalog assignment area (depending on rollout this appears as **Settings > WhatsApp Manager > Catalog** or **Connected assets / Catalogs**).
3. Choose **Connect catalog** and select the same Prakash Electronics Commerce catalog.
4. In **WhatsApp Manager**, open the phone number/business tools catalog settings and confirm the catalog is connected and visible. Enable customer catalog visibility/cart options only if they fit your sales process and are available for the account.
5. Open the business WhatsApp profile or a test chat and confirm the catalog/products appear after Meta finishes item review.

No WABA ID is required by this implementation. A WABA ID is only needed later if WhatsApp Cloud API messaging or programmatic WABA management is added.

## Initial synchronization and testing

1. Deploy the backend environment variables and restart the service.
2. Log in as the main owner and open **Shop Products**.
3. Click **Test connection**. Do not proceed until it confirms product access to the configured catalog.
4. Click **Sync all products**. The UI reports pending/failed counts; the worker processes the database queue with controlled concurrency.
5. Confirm items and diagnostics in **Commerce Manager > Catalog > Items**.
6. Create a test product with a real positive price, description, public HTTPS Cloudinary image, and brand where available. Confirm it becomes **Meta: Synced** and appears in Commerce Manager.
7. Rename it and change the price. Confirm the same Commerce item updates instead of duplicating.
8. Set quantity to `0`. Confirm Meta shows out of stock.
9. Set it inactive. Confirm it is staged/out of stock rather than published.
10. Delete it. Confirm it disappears from the Meta catalog after the delete job runs.
11. Check the connected WhatsApp catalog after Meta processing/review completes.

## Troubleshooting

- **Access denied / code 190:** token is expired/revoked or is not a System User token for the assigned app. Generate a new server token and restart.
- **`(#100) Missing permissions`:** include `catalog_management` on the System User token and assign the catalog's `MANAGE` asset task. `business_management` is not required by this integration.
- **Unsupported object / other code 100:** confirm the Catalog ID, catalog ownership, System User asset assignment, and Graph version.
- **Permission error:** assign the catalog's `MANAGE` task and include `catalog_management` on the token.
- **Product validation failure:** fix the named website field—commonly price, description, brand, product URL, or public HTTPS image—then click **Retry sync**.
- **Rate limit / Meta 5xx / timeout:** leave the job pending; bounded automatic retry applies.
- **WhatsApp does not show items:** confirm the exact same catalog is connected to the WABA, the items are published and approved, and catalog visibility is enabled.

## Verification checklist

- [ ] Correct Business Portfolio selected
- [ ] Meta developer app connected to the portfolio
- [ ] E-commerce catalog created and owned by that portfolio
- [ ] `META_CATALOG_ID` stored on the backend
- [ ] System User created
- [ ] Catalog `MANAGE` access assigned to the System User
- [ ] `catalog_management` included in its token
- [ ] `META_ACCESS_TOKEN` stored only on the backend
- [ ] `META_GRAPH_API_VERSION=v26.0`
- [ ] Correct WhatsApp Business Account connected to this catalog
- [ ] Test connection passes with the expected catalog name
- [ ] Existing products bulk queued and synchronized
- [ ] New product create verified
- [ ] Rename/edit verified without duplication
- [ ] Price and sale price verified
- [ ] Zero stock verified as out of stock
- [ ] Inactive product verified as staging/out of stock
- [ ] Delete verified
- [ ] Failed sync and manual retry verified
