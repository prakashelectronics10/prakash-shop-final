import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowUpRight, BadgePercent, Check, Expand, Filter, PackageSearch, Search, ShoppingBag, ShoppingCart, Tag, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { isWiringAccessoriesCategory, cartStockMessage, getCartStockLimit, useCart, useCartActions, useCartQuantity } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import { ProductShareButton } from "./ProductShareButton";
import { ProductPriceDisplay } from "./ProductPriceDisplay";
import { CatalogInfiniteLoader } from "./CatalogInfiniteLoader";
import { RelatedProductsSection } from "./RelatedProductsSection";
import { Lightbox } from "./Lightbox";
import { SuccessCelebrationOverlay } from "./BookingSuccessOverlay";
import { CatalogGridSkeleton, EmptyProductsState, LoadingState } from "./StateLottie";
import { applyProductPageMeta, getProductSharePath } from "../../utils/productShare";
import { trackProductPageView } from "../../utils/productViews";
import {
  formatTagQuery,
  getTagSearchHref,
  normalizeTag,
  readSearchQueryFromLocation,
} from "../../utils/productSearch";
import { formatINR, resolveProductPricing } from "../../utils/productPricing";
import { notifyCartResult } from "../../utils/cartToast";
import { getAppliedCouponCode, setAppliedCouponCode } from "../../utils/coupons";
import {
  CATALOG_CACHE_TTL_MS,
  SHOP_CATALOG_CACHE_KEY,
  readCatalogCache,
  writeCatalogCache,
} from "../../utils/catalogCache";

const DESCRIPTION_PREVIEW_LIMIT = 520;
const CATALOG_BATCH_SIZE = 24;

function mergeCatalogItems(current, incoming) {
  const byId = new Map();
  [...current, ...incoming].forEach((item) => {
    const key = `${item.sourceType || "shop"}-${item._id || item.sourceId || item.slug}`;
    byId.set(key, item);
  });
  return [...byId.values()];
}

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

const ProductCard = memo(function ProductCard({ product, onAddToCart, eager = false }) {
  const sourceType = product.sourceType || (isWiringAccessoriesCategory(product.category) ? "project-part" : "shop-product");
  const cartQuantity = useCartQuantity(product, { sourceType });
  const detailUrl = getProductSharePath(product);
  const category = product.category || "Electronics";
  const stockLimit = getCartStockLimit(product);
  const atStockLimit = stockLimit > 0 && cartQuantity >= stockLimit;
  return (
    <article className="part-card shop-product-card">
      <ProductShareButton product={product} compact />
      <a className="part-card-main" href={detailUrl}>
        <div className="part-image shop-product-image">
          {product.imageUrl ? (
            <OptimizedImage
              src={product.imageUrl}
              alt={product.name}
              className="shop-product-card-image"
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={eager ? "high" : undefined}
              width={720}
              height={540}
              sizes="(min-width: 1024px) 25vw, (min-width: 760px) 50vw, 46vw"
            />
          ) : <PackageSearch size={48} />}
          <span className={`part-status ${String(product.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>{product.availability || "Available"}</span>
        </div>
        <div className="part-card-body">
          <span className="part-category">{category}</span>
          <h3>{product.name}</h3>
          <p>{product.shortDescription || product.description || "Product available in shop."}</p>
        </div>
      </a>
      <div className="part-card-foot cart-card-foot">
        <ProductPriceDisplay product={product} size="card" />
        <div className="product-card-actions">
          <a href={detailUrl}>.</a>
          <button
            className={`cart-icon-button ${cartQuantity ? "added" : ""}`}
            type="button"
            onClick={() => onAddToCart(product)}
            aria-label={`Add ${product.name} to cart`}
            title={stockLimit < 1 ? "Out of stock" : atStockLimit ? cartStockMessage(product) : "Add to Cart"}
            disabled={stockLimit < 1 || atStockLimit}
          >
            {cartQuantity ? <Check size={17} /> : <ShoppingCart size={17} />}
            <span>{stockLimit < 1 ? "Out of Stock" : atStockLimit ? "Stock Limit" : cartQuantity ? `Added (${cartQuantity})` : "Add to Cart"}</span>
          </button>
        </div>
      </div>
    </article>
  );
});

function ExpandableDescription({ text }) {
  const [expanded, setExpanded] = useState(false);
  const description = String(text || "This product is available at Prakash Electronics.").trim();
  const expandable = description.length > DESCRIPTION_PREVIEW_LIMIT;

  useEffect(() => {
    setExpanded(false);
  }, [description]);

  return (
    <div className={`product-detail-description ${expanded || !expandable ? "expanded" : "collapsed"}`}>
      <p id="product-detail-description-text">{description}</p>
      {expandable ? (
        <button
          type="button"
          className="description-toggle-button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls="product-detail-description-text"
        >
          {expanded ? "View less" : "View more"}
        </button>
      ) : null}
    </div>
  );
}

function productGalleryItems(product = {}) {
  const rawItems = [
    product.imageUrl ? { src: product.imageUrl, label: `${product.name} product image` } : null,
    ...(Array.isArray(product.images) ? product.images.map((item, index) => ({
      src: item?.url,
      label: item?.alt || `${product.name} product image ${index + 2}`,
    })) : []),
  ].filter((item) => item?.src);
  const seen = new Set();
  return rawItems.filter((item) => {
    if (seen.has(item.src)) return false;
    seen.add(item.src);
    return true;
  });
}

function ProductGallery({ product }) {
  const items = useMemo(() => productGalleryItems(product), [product]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const active = items[activeIndex];

  if (!active) return <div className="product-gallery-empty"><PackageSearch size={70} /></div>;
  return (
    <div className="product-gallery">
      <button type="button" className="product-gallery-stage" onClick={() => setLightboxIndex(activeIndex)} aria-label={`Open ${active.label} fullscreen`}>
        <OptimizedImage src={active.src} alt={active.label} className="part-detail-image" width={900} height={900} decoding="async" fetchPriority="high" sizes="(min-width: 1024px) 42vw, 100vw" />
        <span className="product-gallery-expand"><Expand size={17} /> View full size</span>
      </button>
      {items.length > 1 && (
        <div className="product-gallery-thumbnails" aria-label="Product images">
          {items.map((item, index) => (
            <button type="button" className={index === activeIndex ? "active" : ""} onClick={() => setActiveIndex(index)} aria-label={`Show ${item.label}`} aria-current={index === activeIndex ? "true" : undefined} key={item.src}>
              <OptimizedImage src={item.src} alt="" width={96} height={96} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <Lightbox items={items} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={(index) => { setLightboxIndex(index); setActiveIndex(index); }} />
    </div>
  );
}

function DetailFact({ label, value }) {
  if (value === "" || value === null || value === undefined) return null;
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ProductInformation({ product }) {
  const dimensions = product.dimensions;
  const dimensionText = dimensions && [dimensions.length, dimensions.width, dimensions.height].every((value) => Number(value) > 0)
    ? `${dimensions.length} × ${dimensions.width} × ${dimensions.height} ${dimensions.unit || "cm"}`
    : "";
  const weightText = Number(product.weight?.value) > 0 ? `${product.weight.value} ${product.weight.unit || "kg"}` : "";
  const merchantFacts = [
    ["SKU", product.sku], ["Brand", product.brand], ["Model", product.modelNumber],
    ["Manufacturer", product.manufacturer], ["MPN", product.mpn], ["GTIN", product.gtin],
    ["Condition", product.condition ? `${product.condition.charAt(0).toUpperCase()}${product.condition.slice(1)}` : ""],
    ["Warranty", product.warranty], ["Weight", weightText], ["Dimensions", dimensionText],
  ].filter(([, value]) => value);
  const shippingFacts = [
    ["Service area", product.shipping?.serviceArea],
    ["Dispatch", product.shipping?.dispatchTime],
    ["Delivery estimate", product.shipping?.deliveryEstimate],
    ["Delivery charges", product.shipping?.chargeNote],
  ].filter(([, value]) => value);
  const specifications = Array.isArray(product.specifications) ? product.specifications.filter((item) => item?.label || item?.value) : [];
  if (!merchantFacts.length && !shippingFacts.length && !specifications.length) return null;
  return (
    <section className="product-information-panel" aria-labelledby="product-information-title">
      <header><p className="parts-kicker">Complete information</p><h2 id="product-information-title">Product details</h2></header>
      {specifications.length > 0 && <div className="product-information-grid">{specifications.map((item) => <DetailFact label={item.label || "Specification"} value={item.value} key={`${item.label}-${item.value}`} />)}</div>}
      {merchantFacts.length > 0 && <><h3>Identification &amp; specifications</h3><div className="product-information-grid">{merchantFacts.map(([label, value]) => <DetailFact label={label} value={value} key={label} />)}</div></>}
      {shippingFacts.length > 0 && <><h3>Shipping information</h3><div className="product-information-grid">{shippingFacts.map(([label, value]) => <DetailFact label={label} value={value} key={label} />)}</div></>}
    </section>
  );
}

function AdaptiveOfferBanner({ offer }) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const handleLoad = useCallback((event) => {
    const width = Number(event.currentTarget.naturalWidth || 0);
    const height = Number(event.currentTarget.naturalHeight || 0);
    if (width > 0 && height > 0) setAspectRatio(width / height);
  }, []);

  return (
    <div
      className="public-offer-banner-frame"
      style={{ "--offer-image-ratio": String(aspectRatio) }}
    >
      <OptimizedImage
        className="public-offer-banner"
        src={offer.bannerImageUrl}
        alt={`${offer.title} offer`}
        width={900}
        height={600}
        sizes="(min-width: 760px) 700px, calc(100vw - 1.5rem)"
        onLoad={handleLoad}
      />
    </div>
  );
}

function ProductCouponOffers({ offers, appliedCoupon, onApply, privateCode, onPrivateCodeChange, onApplyPrivate, applying, error }) {
  const hasOffers = offers.length > 0;
  const expiryText = (value) => value
    ? `Valid until ${new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
    : "No fixed expiry";
  return (
    <section className="product-coupon-area" aria-labelledby="product-offers-title">
      <div className="product-coupon-heading">
        <span><BadgePercent size={24} /></span>
        <div><p>Coupons &amp; offers</p><h2 id="product-offers-title">Save more on this product</h2></div>
      </div>
      {hasOffers && <div className="public-offer-grid">{offers.map((offer) => {
        const isApplied = appliedCoupon?.code === offer.code;
        return (
          <article className={`public-offer-card ${offer.bannerImageUrl ? "has-banner" : ""} ${offer.imageLayout === "thumbnail" ? "offer-layout-thumbnail" : "offer-layout-banner"} ${isApplied ? "is-applied" : ""}`} key={offer.id || offer.code}>
            {offer.bannerImageUrl && offer.imageLayout !== "thumbnail" ? <AdaptiveOfferBanner key={offer.bannerImageUrl} offer={offer} /> : null}
            <div className="public-offer-content">
              {offer.bannerImageUrl && offer.imageLayout === "thumbnail" ? <AdaptiveOfferBanner key={offer.bannerImageUrl} offer={offer} /> : <span className="public-offer-icon"><BadgePercent size={26} /></span>}
              <div className="public-offer-copy">
                <div className="public-offer-title-row"><h3>{offer.title}</h3>{isApplied && <em><Check size={14} /> Applied</em>}</div>
                {offer.description && <p>{offer.description}</p>}
                <div className="public-offer-meta"><code>{offer.code}</code><span>Save {formatINR(offer.discountAmount)}</span><small>{expiryText(offer.endsAt)}</small></div>
              </div>
              <div className="public-offer-action"><strong>{formatINR(offer.finalPrice)}</strong><small>after offer</small>{!isApplied && <button type="button" onClick={() => onApply(offer)}>Apply <ArrowUpRight size={16} /></button>}</div>
            </div>
          </article>
        );
      })}</div>}
      <form className="private-coupon-form" onSubmit={onApplyPrivate}>
        <div><strong>Have a private coupon?</strong><small>Enter the code shared with you by Prakash Electronics.</small></div>
        <label><span className="sr-only">Private coupon code</span><input value={privateCode} onChange={(event) => onPrivateCodeChange(event.target.value)} placeholder="Enter coupon code" autoComplete="off" /><button className={privateCode && appliedCoupon?.code === privateCode ? "is-applied" : ""} type="submit" disabled={applying || !privateCode.trim() || appliedCoupon?.code === privateCode}>{applying ? "Checking…" : privateCode && appliedCoupon?.code === privateCode ? <><Check size={16} /> Applied</> : "Apply"}</button></label>
      </form>
      {error && <p className="private-coupon-error" role="alert">{error}</p>}
    </section>
  );
}

export function ShopProductsPage() {
  const { addItem } = useCartActions();
  const cachedCatalog = useMemo(
    () => readCatalogCache(SHOP_CATALOG_CACHE_KEY, { ttlMs: CATALOG_CACHE_TTL_MS, allowStale: true }),
    [],
  );
  const [products, setProducts] = useState(() => cachedCatalog?.data?.products || []);
  const [categories, setCategories] = useState(() => cachedCatalog?.data?.categories || []);
  const [page, setPage] = useState(() => cachedCatalog?.data?.page || 1);
  const [catalogTotal, setCatalogTotal] = useState(() => cachedCatalog?.data?.total || cachedCatalog?.data?.products?.length || 0);
  const [catalogPages, setCatalogPages] = useState(() => cachedCatalog?.data?.pages || 1);
  const [highestPrice, setHighestPrice] = useState(() => cachedCatalog?.data?.maxPrice || 0);
  const [loading, setLoading] = useState(() => !(cachedCatalog?.data?.products?.length));
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [search, setSearch] = useState(() => readSearchQueryFromLocation());
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const debouncedMaxPrice = useDebouncedValue(maxPrice, 180);

  useEffect(() => {
    const fromUrl = readSearchQueryFromLocation();
    if (fromUrl) setSearch(fromUrl);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setLoadMoreError("");
        if (page === 1) setError("");
        const query = new URLSearchParams({
          page: String(page),
          limit: String(CATALOG_BATCH_SIZE),
        });
        if (debouncedSearch) query.set("search", debouncedSearch);
        if (category) query.set("category", category);
        if (highestPrice && debouncedMaxPrice && Number(debouncedMaxPrice) < highestPrice) {
          query.set("maxPrice", debouncedMaxPrice);
        }
        const [productsResponse, categoriesResponse] = await Promise.all([
          apiRequest(`/shop-products/public/products?${query.toString()}`, { cacheTtl: CATALOG_CACHE_TTL_MS }),
          page === 1
            ? apiRequest("/shop-products/public/categories", { cacheTtl: CATALOG_CACHE_TTL_MS })
            : Promise.resolve(null),
        ]);
        if (!mounted) return;
        const nextProducts = productsResponse.data?.items || [];
        setProducts((current) => (page === 1 ? nextProducts : mergeCatalogItems(current, nextProducts)));
        if (categoriesResponse) setCategories(categoriesResponse.data || []);
        setCatalogTotal(productsResponse.data?.total || 0);
        setCatalogPages(productsResponse.data?.pages || 1);
        if (!highestPrice) setHighestPrice(productsResponse.data?.maxPrice || 0);
        setError("");
      } catch (err) {
        if (!mounted) return;
        if (page === 1) setError(err.message || "Unable to load products.");
        else setLoadMoreError(err.message || "Unable to load more products.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [cachedCatalog, category, debouncedMaxPrice, debouncedSearch, highestPrice, page, retryKey]);

  useEffect(() => {
    const priceFiltered = highestPrice && maxPrice && Number(maxPrice) < highestPrice;
    if (debouncedSearch || category || priceFiltered || !products.length) return;
    writeCatalogCache(SHOP_CATALOG_CACHE_KEY, {
      products,
      categories,
      page,
      total: catalogTotal,
      pages: catalogPages,
      maxPrice: highestPrice,
    });
  }, [catalogPages, catalogTotal, categories, category, debouncedSearch, highestPrice, maxPrice, page, products]);

  useEffect(() => {
    if (highestPrice && !maxPrice) setMaxPrice(String(highestPrice));
  }, [highestPrice, maxPrice]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (category) count += 1;
    if (highestPrice && maxPrice && Number(maxPrice) < highestPrice) count += 1;
    return count;
  }, [category, highestPrice, maxPrice]);

  const closeFilters = useCallback(() => setFilterOpen(false), []);

  const restartCatalog = useCallback(() => {
    setPage(1);
    setError("");
    setLoadMoreError("");
  }, []);

  const resetSheetFilters = useCallback(() => {
    setCategory("");
    setMaxPrice(highestPrice ? String(highestPrice) : "");
    restartCatalog();
  }, [highestPrice, restartCatalog]);

  const loadMoreProducts = useCallback(() => {
    if (loading || page >= catalogPages) return;
    setPage((current) => current + 1);
  }, [catalogPages, loading, page]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeFilters();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeFilters, filterOpen]);

  const addProductToCart = useCallback((product) => {
    const result = addItem(product, {
      sourceType: product.sourceType || (isWiringAccessoriesCategory(product.category) ? "project-part" : "shop-product"),
    });
    notifyCartResult(result, product.name);
  }, [addItem]);

  const filterSheet = filterOpen
    ? createPortal(
      <div className="shop-filter-sheet-root" role="presentation">
        <button
          type="button"
          className="shop-filter-sheet-backdrop"
          aria-label="Close filters"
          onClick={closeFilters}
        />
        <div
          className="shop-filter-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shop-filter-sheet-title"
        >
          <div className="shop-filter-sheet-handle" aria-hidden="true" />
          <div className="shop-filter-sheet-header">
            <div>
              <p className="shop-filter-sheet-kicker">Refine results</p>
              <h3 id="shop-filter-sheet-title">Filters</h3>
            </div>
            <button
              type="button"
              className="shop-filter-sheet-close"
              onClick={closeFilters}
              aria-label="Close filter sheet"
            >
              <X size={18} />
            </button>
          </div>

          <div className="shop-filter-sheet-body">
            <section className="shop-filter-section">
              <div className="shop-filter-section-head">
                <h4>Categories</h4>
              {category ? (
                  <button type="button" className="shop-filter-clear-link" onClick={() => { setCategory(""); restartCatalog(); }}>
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="shop-filter-category-list" role="listbox" aria-label="Filter by category">
                <button
                  type="button"
                  role="option"
                  aria-selected={!category}
                  className={`shop-filter-category-chip ${!category ? "selected" : ""}`}
                  onClick={() => { setCategory(""); restartCatalog(); }}
                >
                  All Categories
                </button>
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item}
                    role="option"
                    aria-selected={category === item}
                    className={`shop-filter-category-chip ${category === item ? "selected" : ""}`}
                    onClick={() => { setCategory(item); restartCatalog(); }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            <section className="shop-filter-section">
              <div className="shop-filter-section-head">
                <h4>Max price</h4>
              </div>
              <label className="shop-price-filter shop-filter-sheet-price">
                <span>Max {formatINR(maxPrice || highestPrice)}</span>
                <input
                  type="range"
                  min="0"
                  max={highestPrice || 1000}
                  value={maxPrice || highestPrice || 0}
                  onChange={(event) => { setMaxPrice(event.target.value); restartCatalog(); }}
                  disabled={!highestPrice}
                />
              </label>
            </section>
          </div>

          <div className="shop-filter-sheet-footer">
            <button className="shop-filter-sheet-reset" type="button" onClick={resetSheetFilters}>
              Reset
            </button>
            <button className="shop-filter-sheet-apply" type="button" onClick={closeFilters}>
              Show {catalogTotal} {catalogTotal === 1 ? "product" : "products"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="App project-parts-page shop-products-page">
      <Navbar />
      <main>
        <section className="parts-hero shop-hero">
          <div className="parts-hero-inner">
            <a className="detail-back-link catalog-page-back" href="/">
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Back to home</span>
            </a>
            <p className="parts-kicker"><ShoppingBag size={16} /> Public shop products</p>
            <h1>Shop Products</h1>
            <h2>Browse electronics, home appliances, lights, speakers, and useful products from Prakash Electronics.</h2>
          </div>
        </section>

        <section className="parts-products">

          <div className="shop-filter-panel">
            <label className="parts-search shop-search" htmlFor="shop-search-input">
              <Search size={18} />
              <input
                id="shop-search-input"
                type="search"
                value={search}
                placeholder="Search products or #tags (e.g. #speaker)..."
                onChange={(event) => { setSearch(event.target.value); restartCatalog(); }}
              />
              {search && <button type="button" onClick={() => { setSearch(""); restartCatalog(); }} aria-label="Clear search"><X size={16} /></button>}
            </label>

            <button
              className={`shop-filter-trigger ${activeFilterCount ? "active" : ""}`}
              type="button"
              onClick={() => setFilterOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              aria-label="Open filters"
            >
              <Filter size={18} />
              <span>Filter</span>
              {activeFilterCount > 0 ? <em>{activeFilterCount}</em> : null}
            </button>
          </div>

          {!error && (
            <span className="parts-search-count shop-count">
              {loading && products.length ? "Updating results..." : `${catalogTotal} ${catalogTotal === 1 ? "product" : "products"}`}
            </span>
          )}
          {error && <div className="parts-state">{error}</div>}
          {loading && products.length === 0 && <CatalogGridSkeleton count={8} />}
          {!loading && !error && products.length === 0 && (
            <EmptyProductsState message={search || category || activeFilterCount ? "No matching products found." : "No shop products are published yet."} />
          )}

          {!error && products.length > 0 && (
            <>
              <div className="catalog-product-batches">
                {Array.from({ length: Math.ceil(products.length / CATALOG_BATCH_SIZE) }, (_, batchIndex) => (
                  <div className="parts-grid shop-products-grid catalog-product-batch" key={`shop-batch-${batchIndex}`}>
                    {products.slice(batchIndex * CATALOG_BATCH_SIZE, (batchIndex + 1) * CATALOG_BATCH_SIZE).map((product, index) => (
                      <ProductCard
                        product={product}
                        key={`${product.sourceType || "shop"}-${product._id || product.sourceId || product.slug}`}
                        onAddToCart={addProductToCart}
                        eager={batchIndex === 0 && index < 4}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <CatalogInfiniteLoader
                hasMore={page < catalogPages}
                loadedCount={products.length}
                total={catalogTotal}
                loading={loading}
                error={loadMoreError}
                onLoadMore={loadMoreProducts}
                onRetry={() => setRetryKey((current) => current + 1)}
              />
            </>
          )}
        </section>
      </main>
      {filterSheet}
      <Footer />
    </div>
  );
}

export function ProductDetailPage() {
  const { addItem, getQuantity } = useCart();
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const id = ["product", "product-detail"].includes(pathParts[0]) ? pathParts[1] : "";
  const [product, setProduct] = useState(null);
  const [source, setSource] = useState("shop");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publicOffers, setPublicOffers] = useState([]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [privateCode, setPrivateCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [lastValidatedCoupon, setLastValidatedCoupon] = useState(null);
  const [showCouponSuccess, setShowCouponSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadProduct() {
      if (!id) {
        setError("Product detail link is missing.");
        setLoading(false);
        return;
      }
      try {
        const response = await apiRequest(`/shop-products/public/products/${encodeURIComponent(id)}`);
        if (!mounted) return;
        setProduct(response.data || null);
        setSource(response.data?.sourceType === "project-part" ? "project-part" : "shop");
      } catch (_shopError) {
        try {
          const fallback = await apiRequest(`/project-parts/public/parts/${encodeURIComponent(id)}`);
          if (!mounted) return;
          setProduct(fallback.data || null);
          setSource("project-part");
        } catch (err) {
          if (mounted) setError(err.message || "Product not found.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadProduct();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!product || source !== "shop") {
      setPublicOffers([]);
      setAppliedCoupon(null);
      return undefined;
    }
    let mounted = true;
    async function loadCoupons() {
      setCouponError("");
      setLastValidatedCoupon(null);
      try {
        const response = await apiRequest(`/coupons/product/${encodeURIComponent(product._id || product.slug)}`, { cache: "no-store" });
        if (!mounted) return;
        const offers = Array.isArray(response.data?.coupons) ? response.data.coupons : [];
        setPublicOffers(offers);
        const storedCode = getAppliedCouponCode(product);
        if (storedCode) {
          try {
            const validated = await apiRequest("/coupons/validate", { method: "POST", cache: "no-store", body: JSON.stringify({ productId: product._id || product.slug, code: storedCode }) });
            if (!mounted) return;
            setAppliedCoupon(validated.data);
            setAppliedCouponCode(validated.data.code, product);
            if (validated.data?.visibility === "private") setLastValidatedCoupon(validated.data);
            setPrivateCode(validated.data?.visibility === "private" ? storedCode : "");
            return;
          } catch (_invalidStoredCoupon) {
            // A coupon for another product should not block this product's best public offer.
          }
        }
        const bestOffer = offers[0] || null;
        setAppliedCoupon(bestOffer);
        setAppliedCouponCode(bestOffer?.code || "", product);
      } catch (_couponLoadError) {
        if (mounted) setPublicOffers([]);
      }
    }
    loadCoupons();
    return () => { mounted = false; };
  }, [product, source]);

  useEffect(() => {
    if (product) {
      applyProductPageMeta(product, publicOffers);
    }
  }, [product, publicOffers]);

  useEffect(() => {
    if (product) trackProductPageView(product);
  }, [product]);

  const applyPublicOffer = (offer) => {
    setAppliedCoupon(offer);
    setAppliedCouponCode(offer.code, product);
    setPrivateCode("");
    setCouponError("");
  };

  const changePrivateCouponCode = (value) => {
    const safeCode = String(value || "").toUpperCase().replace(/\s+/g, "");
    setPrivateCode(safeCode);
    setCouponError("");
    if (lastValidatedCoupon?.code === safeCode) {
      setAppliedCoupon(lastValidatedCoupon);
      setAppliedCouponCode(lastValidatedCoupon.code, product);
      return;
    }
    if (appliedCoupon?.visibility === "private") {
      const fallback = publicOffers[0] || null;
      setAppliedCoupon(fallback);
      setAppliedCouponCode(fallback?.code || "", product);
    }
  };

  const applyPrivateCoupon = async (event) => {
    event.preventDefault();
    if (!product || !privateCode.trim()) return;
    setCouponApplying(true);
    setCouponError("");
    try {
      const response = await apiRequest("/coupons/validate", { method: "POST", cache: "no-store", body: JSON.stringify({ productId: product._id || product.slug, code: privateCode }) });
      setAppliedCoupon(response.data);
      setLastValidatedCoupon(response.data);
      setAppliedCouponCode(response.data.code, product);
      toast.success(`${response.data.code} applied. You saved ${formatINR(response.data.discountAmount)}.`, { id: "coupon-apply" });
      setShowCouponSuccess(true);
    } catch (couponApplyError) {
      setCouponError(couponApplyError.message || "This coupon could not be applied.");
      toast.error(couponApplyError.message || "This coupon could not be applied.", { id: "coupon-apply" });
    } finally {
      setCouponApplying(false);
    }
  };

  const bookNow = () => {
    if (!product) return;
    if (getCartStockLimit(product) < 1) {
      setError("This product is out of stock.");
      return;
    }
    const result = addItem(product, {
      sourceType: source === "project-part" || product.sourceType === "project-part" ? "project-part" : "shop-product",
    });
    notifyCartResult(result, product.name);
    if (result?.status !== "blocked") window.location.href = "/cart";
  };

  const addCurrentToCart = () => {
    if (!product) return;
    const result = addItem(product, {
      sourceType: source === "project-part" || product.sourceType === "project-part" ? "project-part" : "shop-product",
    });
    notifyCartResult(result, product.name);
  };

  const detailCartQuantity = product ? getQuantity(product, {
    sourceType: source === "project-part" || product.sourceType === "project-part" ? "project-part" : "shop-product",
  }) : 0;
  const detailStockLimit = product ? getCartStockLimit(product) : 0;
  const displayedProduct = useMemo(() => {
    if (!product || !appliedCoupon || !Number.isFinite(Number(appliedCoupon.finalPrice))) return product;
    const basePricing = resolveProductPricing(product);
    const finalPrice = Number(appliedCoupon.finalPrice);
    const comparisonPrice = Number.isFinite(Number(basePricing.mrp)) && Number(basePricing.mrp) > finalPrice
      ? Number(basePricing.mrp)
      : Number(basePricing.price);
    return {
      ...product,
      mrp: Number.isFinite(comparisonPrice) && comparisonPrice > finalPrice ? comparisonPrice : product.mrp,
      price: finalPrice,
      discountPercent: null,
    };
  }, [appliedCoupon, product]);

  return (
    <div className="App project-parts-page shop-products-page">
      <Navbar />
      <SuccessCelebrationOverlay
        open={showCouponSuccess}
        onDone={() => setShowCouponSuccess(false)}
        title="Coupon applied successfully"
        subtitle={appliedCoupon ? `You saved ${formatINR(appliedCoupon.discountAmount)} with ${appliedCoupon.code}.` : "Your discount is ready."}
        ariaLabel="Coupon applied successfully"
      />
      <main className="part-detail-wrap">
        <div className="detail-header-row">
          <a
            className="detail-back-link catalog-page-back"
            href={source === "shop" ? "/products" : CANONICAL_WIRING_PARTS_PATH}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back to {source === "shop" ? "products" : "wiring accessories"}</span>
          </a>
        </div>
        {product && !loading && <nav className="product-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href={source === "shop" ? "/products" : CANONICAL_WIRING_PARTS_PATH}>{source === "shop" ? "Products" : "Wiring accessories"}</a><span>/</span><strong>{product.name}</strong></nav>}
        {loading && <LoadingState message="Loading product details..." className="site-state-lottie--detail" />}
        {error && !loading && <div className="parts-state">{error}</div>}

        {product && !loading && (
          <section className="part-detail-panel">
            <div className="part-detail-media">
              <ProductShareButton product={product} compact />
              <ProductGallery product={product} />
              <span className={`part-status ${String(product.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>{product.availability || "Available"}</span>
            </div>

            <div className="part-detail-content">
              <p className="parts-kicker"><ShoppingBag size={16} /> {source === "shop" ? "Shop product" : "Wiring accessory"}</p>
              <h1>{product.name}</h1>
              <div className="detail-meta-row" style={{marginBottom:"15px"}}>
                <span><Tag size={16} /> {product.category || "Electronics"}</span>
                {product.originalCategory && <span>{product.originalCategory}</span>}
                <small className="stock-limit-text">{cartStockMessage(product)}</small>
              </div>
              {product.shortDescription && <p className="detail-lead" style={{marginLeft:"6px", fontWeight:"800"}}>{product.shortDescription}</p>}
              <ExpandableDescription text={product.description} />
              {Array.isArray(product.specifications) && product.specifications.length > 0 && (
                <div className="part-tags" style={{marginTop:"10px"}}>
                  {product.specifications.map((item) => (
                    <div key={`${item.label}-${item.value}`}>
                      <span style={{letterSpacing:"1px",fontWeight:"500"}}>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(product.tags) && product.tags.length > 0 && (
                <div
                  className="detail-tags"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    margin: "10px 0 0 0",
                  }}
                >
                  {product.tags.map((tag) => {
                    const catalog = source === "project-part" || product.sourceType === "project-part"
                      ? "wiring-parts"
                      : "products";
                    const href = getTagSearchHref(tag, { catalog });
                    const label = formatTagQuery(tag) || `#${normalizeTag(tag)}`;
                    return (
                      <a
                        key={tag}
                        href={href}
                        className="detail-tag-link"
                        aria-label={`Search products with tag ${label}`}
                        style={{
                          background: "linear-gradient(95deg,#fde066 60%,#ffd09c 100%)",
                          color: "#473c0c",
                          borderRadius: "16px",
                          fontSize: "0.92em",
                          fontWeight: "500",
                          padding: "3px 12px",
                          margin: 0,
                          letterSpacing: "0.4px",
                          border: "1px solid #fbe08d",
                          userSelect: "none",
                          cursor: "pointer",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        {label}
                      </a>
                    );
                  })}
                </div>
              )}
         
              <div className="detail-action-bar">
                <ProductPriceDisplay product={displayedProduct} className={appliedCoupon ? "coupon-price-applied" : ""} size="detail" showDiscountBadge />
                <div className="detail-button-group">
                  <button
                    className="book-now-button cart-secondary-button"
                    type="button"
                    onClick={addCurrentToCart}
                    disabled={detailStockLimit < 1 || (detailStockLimit > 0 && detailCartQuantity >= detailStockLimit)}
                  >
                    {detailCartQuantity ? <Check size={18} /> : <ShoppingCart size={18} />} {detailCartQuantity ? `In Cart (${detailCartQuantity})` : "Add to Cart"}
                  </button>
                  <button className="book-now-button" type="button" onClick={bookNow} disabled={detailStockLimit < 1}>
                    <ShoppingBag size={18} /> Buy Now
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {product && !loading && source === "shop" ? (
          <ProductCouponOffers
            offers={publicOffers}
            appliedCoupon={appliedCoupon}
            onApply={applyPublicOffer}
            privateCode={privateCode}
            onPrivateCodeChange={changePrivateCouponCode}
            onApplyPrivate={applyPrivateCoupon}
            applying={couponApplying}
            error={couponError}
          />
        ) : null}

        {product && !loading ? <ProductInformation product={product} /> : null}

        {product && !loading ? (
          <RelatedProductsSection
            product={product}
            sourceType={source === "project-part" || product.sourceType === "project-part" ? "project-part" : "shop"}
            limit={8}
          />
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
