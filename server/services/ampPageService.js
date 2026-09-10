const ShopProduct = require("../models/ShopProduct");
const ProjectPart = require("../models/ProjectPart");
const { isConnected } = require("../config/db");
const { serializeProductMeta } = require("./productMetadataService");

const SITE_NAME = "Prakash Electronics and Electricals";
const AMP_RUNTIME = "https://cdn.ampproject.org/v0.js";
const CATALOG_LIMIT = 24;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function safeImageUrl(value, fallback = "/logo512.png") {
  const url = String(value || "").trim().replace(/^http:\/\//i, "https://");
  if (/^https:\/\//i.test(url) || url.startsWith("/")) return url;
  return fallback;
}

function optimizedImageUrl(value, width) {
  const url = safeImageUrl(value);
  if (!/^https:\/\/res\.cloudinary\.com\//i.test(url) || !url.includes("/image/upload/")) return url;
  if (/\/image\/upload\/[^/]*(?:f_auto|q_auto|w_\d+)/i.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto:good,c_limit,w_${width}/`);
}

function effectiveOffer(product = {}) {
  return (product.publicOffers || [])
    .filter((offer) => offer?.visibility === "public" && Number.isFinite(Number(offer.finalPrice)))
    .sort((a, b) => Number(a.finalPrice) - Number(b.finalPrice))[0] || null;
}

function money(value) {
  if (!Number.isFinite(Number(value))) return "Price on request";
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

const AMP_CSS = `
:root{color-scheme:light;--ink:#132038;--muted:#5b6879;--line:#dbe5f0;--blue:#1769e0;--cyan:#08b9d6;--soft:#f5f9ff}*{box-sizing:border-box}body{margin:0;background:#f6f9fe;color:var(--ink);font-family:Arial,Helvetica,sans-serif;line-height:1.55}a{color:inherit}.wrap{width:min(1120px,calc(100% - 28px));margin:auto}.site-header{position:sticky;top:0;z-index:5;border-bottom:1px solid var(--line);background:#fff}.nav{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:800}.brand amp-img{border-radius:50%}.nav-links{display:flex;align-items:center;gap:8px}.nav-links a,.pill{border:1px solid var(--line);border-radius:999px;padding:9px 13px;text-decoration:none;font-size:14px;font-weight:700}.hero{padding:46px 0 24px}.eyebrow{margin:0 0 8px;color:#057890;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{max-width:850px;margin:0;font-size:clamp(30px,5vw,50px);line-height:1.12}h2{margin:0 0 14px;font-size:clamp(22px,3vw,30px)}.lede{max-width:760px;margin:14px 0 0;color:var(--muted);font-size:17px}.product-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:24px;padding:18px 0 34px}.card{border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.06)}.gallery{padding:12px}.gallery-main{overflow:hidden;border-radius:13px;background:#fff}.gallery-main amp-img img,.thumb amp-img img,.product-image amp-img img{object-fit:contain}.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}.thumb{overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#fff}.info{padding:24px}.badges{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.badge{border-radius:999px;background:#e8f3ff;padding:5px 10px;color:#1557a6;font-size:12px;font-weight:800}.badge.stock{background:#dcfce7;color:#087443}.badge.out{background:#fee2e2;color:#b42318}.price{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;margin:20px 0}.price strong{font-size:30px}.price del{color:#77849a}.discount{color:#07883d;font-weight:800}.cta{display:flex;align-items:center;justify-content:center;min-height:50px;border-radius:12px;background:linear-gradient(135deg,var(--cyan),var(--blue));padding:12px 18px;color:#fff;text-align:center;text-decoration:none;font-weight:900}.hint{margin:8px 0 0;color:var(--muted);font-size:12px}.details{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:0 0 44px}.section{padding:22px}.prose{white-space:pre-line;color:#344054}.specs{width:100%;border-collapse:collapse}.specs th,.specs td{border-bottom:1px solid var(--line);padding:10px 8px;text-align:left;vertical-align:top}.specs th{width:38%;color:var(--muted);font-size:13px}.offers{display:grid;gap:9px}.offer{border:1px solid #a7e7d1;border-radius:12px;background:#effcf7;padding:12px}.offer strong{display:block}.catalog{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding:10px 0 48px}.product-card{overflow:hidden;text-decoration:none}.product-image{border-bottom:1px solid var(--line);background:#fff}.product-copy{padding:14px}.product-copy h2{display:-webkit-box;overflow:hidden;margin:0 0 7px;font-size:17px;line-height:1.3;-webkit-box-orient:vertical;-webkit-line-clamp:2}.product-copy p{display:-webkit-box;overflow:hidden;margin:0 0 12px;color:var(--muted);font-size:14px;-webkit-box-orient:vertical;-webkit-line-clamp:2}.empty{margin:20px 0 48px;padding:28px;text-align:center}.breadcrumbs{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px;color:var(--muted);font-size:13px}.site-footer{border-top:1px solid var(--line);background:#fff;padding:28px 0;color:var(--muted);font-size:13px}@media(max-width:820px){.product-layout,.details{grid-template-columns:1fr}.catalog{grid-template-columns:repeat(2,minmax(0,1fr))}.nav-links a:first-child{display:none}}@media(max-width:460px){.wrap{width:min(100% - 20px,1120px)}.nav{min-height:62px}.brand span{font-size:14px}.nav-links{gap:5px}.nav-links a,.pill{padding:7px 9px;font-size:12px}.hero{padding-top:30px}.catalog{gap:9px}.product-copy{padding:10px}.product-copy h2{font-size:15px}.info,.section{padding:17px}.thumbs{grid-template-columns:repeat(3,1fr)}}`;

function ampShell({ title, description, canonicalUrl, ogImage, jsonLd, body, robots = "index, follow", preloadImage = "" }) {
  return `<!doctype html>
<html amp lang="en">
<head>
  <meta charset="utf-8">
  <script async src="${AMP_RUNTIME}"></script>
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:type" content="${/\.png(?:$|\?)/i.test(ogImage) ? "image/png" : "image/jpeg"}">
  ${preloadImage ? `<link rel="preload" as="image" href="${escapeHtml(preloadImage)}">` : ""}
  <link rel="icon" href="/favicon-32.png">
  <script type="application/ld+json">${safeJson(jsonLd)}</script>
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
  <style amp-custom>${AMP_CSS}</style>
</head>
<body>
  <header class="site-header"><div class="wrap nav"><a class="brand" href="/"><amp-img src="/logo192.png" width="38" height="38" alt="Prakash Electronics logo"></amp-img><span>Prakash Electronics</span></a><nav class="nav-links" aria-label="Primary"><a href="/products">Products</a><a href="/wiring-parts">Wiring</a><a href="/pulse-ai">Pulse AI</a></nav></div></header>
  <main>${body}</main>
  <footer class="site-footer"><div class="wrap">© Prakash Electronics and Electricals · Chitarpur, Jharkhand · <a href="${escapeHtml(canonicalUrl)}">Open the full website</a></div></footer>
</body>
</html>`;
}

function productStructuredData(product, origin) {
  const offer = effectiveOffer(product);
  const price = offer ? Number(offer.finalPrice) : product.price;
  const canonicalUrl = `${origin}/product/${encodeURIComponent(product.identifier)}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: product.name,
        description: product.description,
        image: product.images,
        url: canonicalUrl,
        sku: product.sku,
        category: product.category,
        ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
        ...(product.gtin ? { gtin: product.gtin } : {}),
        ...(product.mpn ? { mpn: product.mpn } : {}),
        ...(product.modelNumber ? { model: product.modelNumber } : {}),
        ...(Number.isFinite(Number(price)) ? { offers: { "@type": "Offer", url: canonicalUrl, priceCurrency: "INR", price: String(price), availability: product.availability, itemCondition: `https://schema.org/${product.condition === "used" ? "UsedCondition" : product.condition === "refurbished" ? "RefurbishedCondition" : "NewCondition"}`, seller: { "@type": "Organization", name: SITE_NAME } } } : {}),
      },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: product.sourceType === "project-part" ? "Wiring Accessories" : "Products", item: `${origin}/${product.sourceType === "project-part" ? "wiring-parts" : "products"}` },
        { "@type": "ListItem", position: 3, name: product.name, item: canonicalUrl },
      ] },
    ],
  };
}

function renderAmpProductPage(product, origin) {
  const canonicalUrl = `${origin}/product/${encodeURIComponent(product.identifier)}`;
  const offer = effectiveOffer(product);
  const price = offer ? Number(offer.finalPrice) : product.price;
  const images = (product.images?.length ? product.images : [product.image]).filter(Boolean).slice(0, 5);
  const mainImage = optimizedImageUrl(images[0], 1200);
  const specifications = [
    ["Category", product.category], ["Brand", product.brand], ["Manufacturer", product.manufacturer],
    ["Model", product.modelNumber], ["SKU", product.sku], ["GTIN", product.gtin], ["MPN", product.mpn],
    ["Warranty", product.warranty], ...((product.specifications || []).map((item) => [item.label, item.value])),
  ].filter(([, value]) => value);
  const shipping = Object.entries(product.shipping || {}).filter(([, value]) => value);
  const body = `<section class="wrap hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="${product.sourceType === "project-part" ? "/wiring-parts" : "/products"}">${product.sourceType === "project-part" ? "Wiring Accessories" : "Products"}</a><span>›</span><span>${escapeHtml(product.name)}</span></nav><p class="eyebrow">AMP product page</p><h1>${escapeHtml(product.name)}</h1></section>
  <section class="wrap product-layout"><div class="card gallery"><div class="gallery-main"><amp-img src="${escapeHtml(mainImage)}" width="1200" height="900" layout="responsive" alt="${escapeHtml(product.imageAlt || product.name)}"></amp-img></div>${images.length > 1 ? `<div class="thumbs">${images.slice(1).map((image, index) => `<div class="thumb"><amp-img src="${escapeHtml(optimizedImageUrl(image, 360))}" width="320" height="240" layout="responsive" alt="${escapeHtml(`${product.name} view ${index + 2}`)}"></amp-img></div>`).join("")}</div>` : ""}</div>
  <article class="card info"><div class="badges"><span class="badge">${escapeHtml(product.category)}</span><span class="badge ${product.availability.endsWith("OutOfStock") ? "out" : "stock"}">${escapeHtml(product.availabilityLabel)}</span></div><p class="lede">${escapeHtml(product.shortDescription || product.description)}</p><div class="price"><strong>${escapeHtml(money(price))}</strong>${product.mrp && product.mrp > price ? `<del>${escapeHtml(money(product.mrp))}</del>` : ""}${product.discountPercent ? `<span class="discount">${escapeHtml(product.discountPercent)}% off</span>` : ""}</div>${offer ? `<div class="offer"><strong>${escapeHtml(offer.title)}</strong><span>${escapeHtml(offer.description || `Save ${money(offer.discountAmount)}`)}</span></div>` : ""}<a class="cta" href="${escapeHtml(canonicalUrl)}">View product and add to cart</a><p class="hint">Secure cart, checkout and account features continue on the full website.</p></article></section>
  <section class="wrap details"><article class="card section"><h2>Product details</h2><div class="prose">${escapeHtml(product.fullDescription || product.description)}</div>${shipping.length ? `<h2>Delivery information</h2><table class="specs"><tbody>${shipping.map(([label, value]) => `<tr><th>${escapeHtml(label.replace(/([A-Z])/g, " $1"))}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>` : ""}</article><article class="card section"><h2>Specifications</h2>${specifications.length ? `<table class="specs"><tbody>${specifications.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>` : `<p class="prose">Detailed specifications are available on the full product page.</p>`}</article></section>`;
  return ampShell({ title: `${product.title} | Prakash Electronics`, description: product.description, canonicalUrl, ogImage: safeImageUrl(product.image, `${origin}/og-image.jpg`), jsonLd: productStructuredData(product, origin), body, preloadImage: mainImage });
}

function renderAmpCatalogPage({ products, sourceType, origin }) {
  const wiring = sourceType === "project-part";
  const canonicalPath = wiring ? "/wiring-parts" : "/products";
  const canonicalUrl = `${origin}${canonicalPath}`;
  const title = wiring ? "Wiring Accessories in Chitarpur | Prakash Electronics" : "Electronics Shop Products in Chitarpur | Prakash Electronics";
  const description = wiring ? "Browse switches, sockets, wires, MCBs, electrical fittings, and wiring accessories from Prakash Electronics in Chitarpur." : "Browse electronics products, home appliances, accessories, and shop products from Prakash Electronics and Electricals in Chitarpur.";
  const itemList = products.map((product, index) => ({ "@type": "ListItem", position: index + 1, url: `${origin}/product/${encodeURIComponent(product.identifier)}`, name: product.name }));
  const cards = products.map((product) => { const offer = effectiveOffer(product); const price = offer ? Number(offer.finalPrice) : product.price; return `<a class="card product-card" href="/amp/product/${encodeURIComponent(product.identifier)}"><div class="product-image"><amp-img src="${escapeHtml(optimizedImageUrl(product.image, 640))}" width="480" height="360" layout="responsive" alt="${escapeHtml(product.name)}"></amp-img></div><div class="product-copy"><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.shortDescription || product.description)}</p><strong>${escapeHtml(money(price))}</strong></div></a>`; }).join("");
  const body = `<section class="wrap hero"><p class="eyebrow">Fast AMP catalogue</p><h1>${wiring ? "Wiring accessories" : "Electronics products"}</h1><p class="lede">${escapeHtml(description)}</p><p><a class="pill" href="${canonicalPath}">Search and filter on the full catalogue</a></p></section><section class="wrap catalog">${cards || `<div class="card empty"><h2>No products are published yet</h2><p>Please check the full catalogue again soon.</p></div>`}</section>`;
  return ampShell({ title, description, canonicalUrl, ogImage: `${origin}/${wiring ? "og-image-wiring.jpg" : "og-image-shop-products.png"}`, jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: canonicalUrl, mainEntity: { "@type": "ItemList", itemListElement: itemList } }, body });
}

function renderAmpNotFound(origin) {
  return ampShell({ title: `Product not found | ${SITE_NAME}`, description: "The requested product is unavailable or no longer published.", canonicalUrl: `${origin}/products`, ogImage: `${origin}/og-image.jpg`, robots: "noindex, follow", jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "Product not found" }, body: `<section class="wrap hero"><p class="eyebrow">404</p><h1>Product not found</h1><p class="lede">This item is unavailable or no longer published.</p><p><a class="pill" href="/products">Browse current products</a></p></section>` });
}

async function listAmpProducts(sourceType, origin) {
  if (!isConnected()) return [];
  const projection = "name slug shortDescription description seoTitle seoDescription category subCategory mrp discountPercent price quantity stock availability imageUrl images tags specifications isActive sku brand gtin mpn manufacturer modelNumber condition warranty shipping displayOrder";
  const sources = sourceType === "project-part"
    ? [[ProjectPart, "project-part"]]
    : [[ShopProduct, "shop-product"], [ProjectPart, "project-part"]];
  const groups = await Promise.all(sources.map(async ([Model, itemSourceType]) => {
    const items = await Model.find({ isActive: true })
      .select(projection)
      .sort({ displayOrder: 1, name: 1, _id: 1 })
      .limit(CATALOG_LIMIT)
      .maxTimeMS(5000)
      .lean();
    return items.map((item) => ({
      ...serializeProductMeta(item, { origin, sourceType: itemSourceType }),
      displayOrder: Number(item.displayOrder || 0),
    }));
  }));
  return groups
    .flat()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    .slice(0, CATALOG_LIMIT);
}

module.exports = { AMP_RUNTIME, escapeHtml, listAmpProducts, renderAmpCatalogPage, renderAmpNotFound, renderAmpProductPage };
