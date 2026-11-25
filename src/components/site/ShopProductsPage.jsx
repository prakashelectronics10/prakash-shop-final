import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowUpRight, BadgePercent, Ban, Check, Expand, Filter, PackageSearch, ShoppingBag, ShoppingCart, Tag, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { requestCatalogResults } from "../../api/catalogSearch";
import { isWiringAccessoriesCategory, cartStockMessage, getCartStockLimit, useCart, useCartActions, useCartQuantity } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import { ProductShareButton } from "./ProductShareButton";
import { ProductPriceDisplay } from "./ProductPriceDisplay";
import { ProductVariantSelector } from "./ProductVariantSelector";
import { CatalogInfiniteLoader } from "./CatalogInfiniteLoader";
import { CatalogSearchField, CatalogSearchStatus } from "./CatalogSearchField";
import { RelatedProductsSection } from "./RelatedProductsSection";
import { Lightbox } from "./Lightbox";
import { SuccessCelebrationOverlay } from "./BookingSuccessOverlay";
import { CatalogGridSkeleton, EmptyProductsState, ProductDetailSkeleton } from "./StateLottie";
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
import {
  formatVariantSummary,
  productHasVariants,
  readVariantIdFromLocation,
  resolveSelectedCombination,
  resolveVariantAvailability,
  resolveVariantImage,
  resolveVariantPricing,
  resolveVariantSku,
  resolveVariantStock,
  selectionLabels,
} from "../../utils/productVariants";

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
  const requiresVariantChoice = Boolean(product.hasVariants);
  const stockLimit = getCartStockLimit(product);
  const atStockLimit = !requiresVariantChoice && stockLimit > 0 && cartQuantity >= stockLimit;
  const isOutOfStock = stockLimit < 1;
  const buttonTextColor = isOutOfStock ? "#00a5f8" : atStockLimit ? "#0f172a" : "#fffefe";
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
              width={480}
              height={360}
              sizes="(min-width: 1024px) 25vw, (min-width: 760px) 50vw, 46vw"
            />
          ) : <PackageSearch size={48} />}
          
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
          {requiresVariantChoice ? (
            <a
              className="cart-icon-button"
              href={detailUrl}
              aria-label={`Choose options for ${product.name}`}
              title="Choose options"
              style={{
                color: buttonTextColor,
                opacity: 1,
                WebkitTextFillColor: buttonTextColor,
                textDecoration: "none",
              }}
            >
              <ShoppingCart size={17} />
              <span style={{ color: buttonTextColor, opacity: 1, WebkitTextFillColor: buttonTextColor }}>
                Choose options
              </span>
            </a>
          ) : (
            <button
              className={`cart-icon-button ${cartQuantity ? "added" : ""}`}
              type="button"
              onClick={() => onAddToCart(product)}
              aria-label={`Add ${product.name} to cart`}
              title={stockLimit < 1 ? "Out of stock" : atStockLimit ? cartStockMessage(product) : "Add to Cart"}
              disabled={stockLimit < 1 || atStockLimit}
              style={{
                color: buttonTextColor,
                opacity: 1,
                WebkitTextFillColor: buttonTextColor,
              }}
            >
              {isOutOfStock || atStockLimit ? <Ban size={17} /> : cartQuantity ? <Check size={17} /> : <ShoppingCart size={17} />}
              <span
                style={{
                  color: buttonTextColor,
                  opacity: 1,
                  WebkitTextFillColor: buttonTextColor,
                }}
              >
                {stockLimit < 1 ? "Out of Stock" : atStockLimit ? "Stock Limit" : cartQuantity ? `Added (${cartQuantity})` : "Add to Cart"}
              </span>
            </button>
          )}
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

function productGalleryItems(product = {}, featuredImageUrl = "") {
  const featured = String(featuredImageUrl || "").trim();
  const rawItems = [
    featured ? { src: featured, label: `${product.name} selected variant image` } : null,
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

function ProductGallery({ product, featuredImageUrl = "" }) {
  const items = useMemo(() => productGalleryItems(product, featuredImageUrl), [product, featuredImageUrl]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const viewportRef = useRef(null);
  const thumbnailRefs = useRef([]);
  const activeIndexRef = useRef(0);
  const scrollFrameRef = useRef(0);
  const scrollSettleTimerRef = useRef(0);
  const pointerStartRef = useRef(null);
  const suppressOpenRef = useRef(false);
  const previousFeaturedRef = useRef(featuredImageUrl);
  const active = items[activeIndex];

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    thumbnailRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex]);

  useEffect(() => {
    const featuredChanged = featuredImageUrl !== previousFeaturedRef.current;
    previousFeaturedRef.current = featuredImageUrl;
    setActiveIndex(0);
    activeIndexRef.current = 0;
    viewportRef.current?.scrollTo({
      left: 0,
      behavior: featuredChanged ? "smooth" : "auto",
    });
  }, [product?._id, product?.slug, featuredImageUrl]);

  useEffect(() => () => {
    window.cancelAnimationFrame(scrollFrameRef.current);
    window.clearTimeout(scrollSettleTimerRef.current);
  }, []);

  const showImage = useCallback((nextIndex, behavior = "smooth") => {
    const safeIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
    setActiveIndex(safeIndex);
    activeIndexRef.current = safeIndex;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ left: safeIndex * viewport.clientWidth, behavior });
  }, [items.length]);

  const syncActiveImage = () => {
    suppressOpenRef.current = true;
    window.clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 140);
    window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport?.clientWidth) return;
      const nextIndex = Math.max(0, Math.min(items.length - 1, Math.round(viewport.scrollLeft / viewport.clientWidth)));
      if (nextIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
      }
    });
  };

  const notePointerStart = (event) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const notePointerEnd = (event) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return;
    suppressOpenRef.current = true;
    window.clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 120);
  };

  if (!active) return <div className="product-gallery-empty"><PackageSearch size={70} /></div>;
  return (
    <div className="product-gallery">
      <div className="product-gallery-stage-shell">
        <div
          ref={viewportRef}
          className="product-gallery-stage"
          aria-label="Product image carousel"
          onScroll={syncActiveImage}
          onPointerDown={notePointerStart}
          onPointerUp={notePointerEnd}
          onPointerCancel={() => { pointerStartRef.current = null; }}
        >
          <div className="product-gallery-track">
            {items.map((item, index) => (
              <button
                type="button"
                className="product-gallery-slide"
                onClick={() => {
                  if (suppressOpenRef.current) return;
                  setLightboxIndex(index);
                }}
                aria-label={`Open ${item.label} fullscreen`}
                key={item.src}
              >
                <OptimizedImage
                  src={item.src}
                  alt={item.label}
                  className="part-detail-image"
                  width={1200}
                  height={900}
                  loading="eager"
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : "auto"}
                  sizes="(min-width: 1024px) 42vw, 100vw"
                />
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="product-gallery-expand" onClick={() => setLightboxIndex(activeIndex)} aria-label={`Open ${active.label} fullscreen`}>
          <Expand size={17} /> View full size
        </button>
      </div>
      {items.length > 1 && (
        <div className="product-gallery-thumbnails" aria-label="Product images">
          {items.map((item, index) => (
            <button
              ref={(node) => { thumbnailRefs.current[index] = node; }}
              type="button"
              className={index === activeIndex ? "active" : ""}
              onClick={() => showImage(index)}
              aria-label={`Show ${item.label}`}
              aria-current={index === activeIndex ? "true" : undefined}
              key={item.src}
            >
              <OptimizedImage src={item.src} alt="" width={160} height={120} loading="eager" decoding="async" sizes="72px" />
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
  const [searchMode, setSearchMode] = useState("");
  const [highestPrice, setHighestPrice] = useState(() => cachedCatalog?.data?.maxPrice || 0);
  const [loadingPhase, setLoadingPhase] = useState(() => cachedCatalog?.data?.products?.length ? "" : "searching");
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [search, setSearch] = useState(() => readSearchQueryFromLocation());
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const searchTerm = search.trim();
  const debouncedSearch = useDebouncedValue(searchTerm, 400);
  const searchPending = searchTerm !== debouncedSearch;
  const loading = Boolean(loadingPhase);
  const debouncedMaxPrice = useDebouncedValue(maxPrice, 180);
  const appliedMaxPrice = highestPrice && Number(debouncedMaxPrice) < highestPrice ? debouncedMaxPrice : "";

  useEffect(() => {
    const fromUrl = readSearchQueryFromLocation();
    if (fromUrl) setSearch(fromUrl);
  }, []);

  useEffect(() => {
    if (searchPending) return undefined;
    let mounted = true;
    async function load() {
      try {
        setLoadingPhase("searching");
        setLoadMoreError("");
        if (page === 1) setError("");
        const query = new URLSearchParams({
          page: String(page),
          limit: String(CATALOG_BATCH_SIZE),
        });
        if (debouncedSearch) query.set("search", debouncedSearch);
        if (category) query.set("category", category);
        if (appliedMaxPrice) query.set("maxPrice", appliedMaxPrice);
        const [productsResponse, categoriesResponse] = await Promise.all([
          requestCatalogResults("/shop-products/public/products", query, {
            cacheTtl: CATALOG_CACHE_TTL_MS,
            startAnalysis: () => {
              if (!mounted) return false;
              if (page === 1) setLoadingPhase("analyzing");
              return true;
            },
          }),
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
        setSearchMode(productsResponse.data?.searchMode || "");
        setHighestPrice((current) => current || productsResponse.data?.maxPrice || 0);
        setError("");
      } catch (err) {
        if (!mounted) return;
        if (page === 1) setError(err.message || "Unable to load products.");
        else setLoadMoreError(err.message || "Unable to load more products.");
      } finally {
        if (mounted) setLoadingPhase("");
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [appliedMaxPrice, category, debouncedSearch, page, retryKey, searchPending]);

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
    if (loading || searchPending || page >= catalogPages) return;
    setPage((current) => current + 1);
  }, [catalogPages, loading, page, searchPending]);

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
    if (product?.hasVariants) {
      window.location.href = getProductSharePath(product);
      return;
    }
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
            <div className="catalog-page-heading">
              <h1>Shop Products</h1>
              <h2>Browse electronics, home appliances, lights, speakers, and useful products from Prakash Electronics.</h2>
            </div>
          </div>
        </section>

        <section className="parts-products">

          <div className="shop-filter-panel">
            <CatalogSearchField
              id="shop-search-input"
              label="Search shop products"
              placeholder="Search products or #tags (e.g. #speaker)..."
              value={search}
              onChange={(value) => { setSearch(value); restartCatalog(); }}
            />

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
            <CatalogSearchStatus phase={searchPending ? "searching" : loadingPhase} total={catalogTotal} mode={searchMode} />
          )}
          {error && <div className="parts-state">{error}</div>}
          {loading && products.length === 0 && <CatalogGridSkeleton count={8} />}
          {!loading && !searchPending && !error && products.length === 0 && (
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
  const [couponOffers, setCouponOffers] = useState(null);
  const [couponSelection, setCouponSelection] = useState(null);
  const [privateCode, setPrivateCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [lastValidatedCoupon, setLastValidatedCoupon] = useState(null);
  const [showCouponSuccess, setShowCouponSuccess] = useState(false);
  const [selectedCombinationId, setSelectedCombinationId] = useState(() => readVariantIdFromLocation());
  const couponRequestRef = useRef(0);

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
        } catch (_err) {
          if (mounted) window.location.replace("/products");
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

  const activeCombination = useMemo(() => {
    if (!product || !productHasVariants(product)) return null;
    return resolveSelectedCombination(product, { combinationId: selectedCombinationId });
  }, [product, selectedCombinationId]);
  const selectedOptionIds = useMemo(() => (activeCombination?.optionIds || []).map(String), [activeCombination]);
  const combinationId = activeCombination?.id || "";
  const couponProduct = useMemo(() => product && { ...product, variantCombinationId: combinationId }, [product, combinationId]);
  const publicOffers = useMemo(() => (
    couponOffers?.combinationId === combinationId ? couponOffers.offers : []
  ), [couponOffers, combinationId]);
  const appliedCoupon = couponSelection?.combinationId === combinationId ? couponSelection.offer : null;
  const setAppliedCoupon = useCallback((offer) => setCouponSelection({ combinationId, offer }), [combinationId]);

  useEffect(() => {
    if (!product || source !== "shop") {
      setCouponOffers(null);
      setAppliedCoupon(null);
      return undefined;
    }
    let mounted = true;
    async function loadCoupons() {
      setCouponError("");
      setLastValidatedCoupon(null);
      try {
        const productId = product._id || product.slug;
        const variantQuery = combinationId ? `?variantCombinationId=${encodeURIComponent(combinationId)}` : "";
        const response = await apiRequest(`/coupons/product/${encodeURIComponent(productId)}${variantQuery}`, { cache: "no-store" });
        if (!mounted) return;
        const offers = Array.isArray(response.data?.coupons) ? response.data.coupons : [];
        setCouponOffers({ combinationId, offers });
        const storedCode = getAppliedCouponCode(couponProduct);
        if (storedCode) {
          try {
            const validated = await apiRequest("/coupons/validate", { method: "POST", cache: "no-store", body: JSON.stringify({ productId, code: storedCode, variantCombinationId: combinationId }) });
            if (!mounted) return;
            setAppliedCoupon(validated.data);
            setAppliedCouponCode(validated.data.code, couponProduct);
            if (validated.data?.visibility === "private") setLastValidatedCoupon(validated.data);
            setPrivateCode(validated.data?.visibility === "private" ? storedCode : "");
            return;
          } catch (_invalidStoredCoupon) {
            // The stored coupon may not apply to the selected variant's price.
          }
        }
        if (!mounted) return;
        const bestOffer = offers[0] || null;
        setAppliedCoupon(bestOffer);
        setPrivateCode("");
        setAppliedCouponCode(bestOffer?.code || "", couponProduct);
      } catch (_couponLoadError) {
        if (mounted) setCouponOffers(null);
      }
    }
    loadCoupons();
    return () => { mounted = false; };
  }, [combinationId, couponProduct, product, setAppliedCoupon, source]);

  const variantView = useMemo(() => {
    if (!product || !productHasVariants(product) || !activeCombination) {
      return {
        pricing: product ? resolveProductPricing(product) : null,
        stock: product && !productHasVariants(product) ? getCartStockLimit(product) : 0,
        availability: productHasVariants(product) ? "Out of Stock" : product?.availability || "Available",
        imageUrl: "",
        sku: product?.sku || "",
        summary: "",
        selections: [],
      };
    }
    const pricing = resolveVariantPricing(product, activeCombination, resolveProductPricing);
    return {
      pricing,
      stock: resolveVariantStock(product, activeCombination),
      availability: resolveVariantAvailability(product, activeCombination),
      imageUrl: resolveVariantImage(product, activeCombination, selectedOptionIds),
      sku: resolveVariantSku(product, activeCombination),
      summary: formatVariantSummary(product, activeCombination.optionIds || selectedOptionIds),
      selections: selectionLabels(product, activeCombination.optionIds || selectedOptionIds),
    };
  }, [product, activeCombination, selectedOptionIds]);

  const handleVariantChange = useCallback((combination) => {
    couponRequestRef.current += 1;
    setCouponApplying(false);
    setShowCouponSuccess(false);
    setLastValidatedCoupon(null);
    setCouponError("");
    setSelectedCombinationId(combination.id);
    const url = new URL(window.location.href);
    url.searchParams.set("v", combination.id);
    url.searchParams.delete("variant");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const shareProductPayload = useMemo(() => {
    if (!product) return null;
    if (!productHasVariants(product) || !activeCombination) return product;
    return {
      ...product,
      variantCombinationId: activeCombination.id,
      variantOptionIds: activeCombination.optionIds || selectedOptionIds,
      variantSummary: variantView.summary,
      imageUrl: variantView.imageUrl || product.imageUrl,
      sku: variantView.sku || product.sku,
      price: variantView.pricing?.price ?? product.price,
      mrp: variantView.pricing?.mrp ?? product.mrp,
    };
  }, [product, activeCombination, selectedOptionIds, variantView]);

  useEffect(() => {
    if (shareProductPayload) {
      applyProductPageMeta(shareProductPayload, publicOffers);
    }
  }, [shareProductPayload, publicOffers]);

  useEffect(() => {
    if (product) trackProductPageView(product);
  }, [product]);

  const applyPublicOffer = (offer) => {
    setAppliedCoupon(offer);
    setAppliedCouponCode(offer.code, couponProduct);
    setPrivateCode("");
    setCouponError("");
  };

  const changePrivateCouponCode = (value) => {
    const safeCode = String(value || "").toUpperCase().replace(/\s+/g, "");
    setPrivateCode(safeCode);
    setCouponError("");
    if (lastValidatedCoupon?.code === safeCode) {
      setAppliedCoupon(lastValidatedCoupon);
      setAppliedCouponCode(lastValidatedCoupon.code, couponProduct);
      return;
    }
    if (appliedCoupon?.visibility === "private") {
      const fallback = publicOffers[0] || null;
      setAppliedCoupon(fallback);
      setAppliedCouponCode(fallback?.code || "", couponProduct);
    }
  };

  const applyPrivateCoupon = async (event) => {
    event.preventDefault();
    if (!product || !privateCode.trim()) return;
    const requestId = ++couponRequestRef.current;
    setCouponApplying(true);
    setCouponError("");
    try {
      const response = await apiRequest("/coupons/validate", { method: "POST", cache: "no-store", body: JSON.stringify({ productId: product._id || product.slug, code: privateCode, variantCombinationId: combinationId }) });
      if (requestId !== couponRequestRef.current) return;
      setAppliedCoupon(response.data);
      setLastValidatedCoupon(response.data);
      setAppliedCouponCode(response.data.code, couponProduct);
      toast.success(`${response.data.code} applied. You saved ${formatINR(response.data.discountAmount)}.`, { id: "coupon-apply" });
      setShowCouponSuccess(true);
    } catch (couponApplyError) {
      if (requestId !== couponRequestRef.current) return;
      setCouponError(couponApplyError.message || "This coupon could not be applied.");
      toast.error(couponApplyError.message || "This coupon could not be applied.", { id: "coupon-apply" });
    } finally {
      if (requestId === couponRequestRef.current) setCouponApplying(false);
    }
  };

  const cartOverrides = useMemo(() => {
    if (!product) return {};
    const sourceType = source === "project-part" || product.sourceType === "project-part" ? "project-part" : "shop-product";
    if (!productHasVariants(product) || !activeCombination) {
      return { sourceType };
    }
    return {
      sourceType,
      variantCombinationId: activeCombination.id,
      variantOptionIds: activeCombination.optionIds || selectedOptionIds,
      variantSummary: variantView.summary,
      variantSelections: variantView.selections,
      variantSku: variantView.sku,
      price: variantView.pricing?.price ?? product.price,
      availability: variantView.availability,
      stockQuantity: variantView.stock,
      productImageUrl: variantView.imageUrl || product.imageUrl,
    };
  }, [product, source, activeCombination, selectedOptionIds, variantView]);

  const detailStockLimit = productHasVariants(product) ? variantView.stock : product ? getCartStockLimit(product) : 0;
  const variantPrice = variantView.pricing?.price;
  const variantUnavailable = productHasVariants(product)
    && (detailStockLimit < 1 || !Number.isFinite(variantPrice) || variantPrice <= 0);
  const canPurchase = detailStockLimit > 0 && !variantUnavailable;

  const bookNow = () => {
    if (!product || !canPurchase) return;
    const result = addItem(product, cartOverrides);
    notifyCartResult(result, product.name);
    if (result?.status !== "blocked") window.location.href = "/cart";
  };

  const addCurrentToCart = () => {
    if (!product || !canPurchase) return;
    const result = addItem(product, cartOverrides);
    notifyCartResult(result, product.name);
  };

  const detailCartQuantity = product ? getQuantity(product, cartOverrides) : 0;
  const displayedProduct = useMemo(() => {
    if (!product) return product;
    const basePricing = productHasVariants(product) && variantView.pricing
      ? variantView.pricing
      : resolveProductPricing(product);
    const withVariant = {
      ...product,
      mrp: basePricing.mrp ?? product.mrp,
      price: basePricing.price ?? product.price,
      discountPercent: productHasVariants(product) ? null : product.discountPercent,
      availability: productHasVariants(product) ? variantView.availability : product.availability,
      sku: productHasVariants(product) ? (variantView.sku || product.sku) : product.sku,
    };
    if (!appliedCoupon || !Number.isFinite(Number(appliedCoupon.finalPrice))) return withVariant;
    const finalPrice = Number(appliedCoupon.finalPrice);
    const comparisonPrice = Number.isFinite(Number(basePricing.mrp)) && Number(basePricing.mrp) > finalPrice
      ? Number(basePricing.mrp)
      : Number(basePricing.price);
    return {
      ...withVariant,
      mrp: Number.isFinite(comparisonPrice) && comparisonPrice > finalPrice ? comparisonPrice : withVariant.mrp,
      price: finalPrice,
      discountPercent: null,
    };
  }, [appliedCoupon, product, variantView]);

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
        {loading && <ProductDetailSkeleton />}
        {error && !loading && <div className="parts-state">{error}</div>}

        {product && !loading && (
          <section className="part-detail-panel">
            <div className="part-detail-media">
              <ProductShareButton product={product} shareOverrides={shareProductPayload} compact />
              <ProductGallery product={product} featuredImageUrl={variantView.imageUrl} />
              <span className={`part-status ${String((productHasVariants(product) ? variantView.availability : product.availability) || "").toLowerCase().replace(/\s+/g, "-")}`}>
                {(productHasVariants(product) ? variantView.availability : product.availability) || "Available"}
              </span>
            </div>

            <div className="part-detail-content">
              <p className="parts-kicker"><ShoppingBag size={16} /> {source === "shop" ? "Shop product" : "Wiring accessory"}</p>
              <h1>{product.name}</h1>
              <div className="detail-meta-row">
                <span className="detail-meta-chip">
                  <Tag size={14} aria-hidden="true" />
                  {product.category || "Electronics"}
                </span>
                {product.originalCategory ? (
                  <span className="detail-meta-chip">{product.originalCategory}</span>
                ) : null}
                <span className="detail-meta-chip detail-meta-chip--stock">
                  {cartStockMessage({
                    availability: productHasVariants(product) ? variantView.availability : product.availability,
                    stockQuantity: detailStockLimit,
                  })}
                </span>
              </div>
              {product.shortDescription && <p className="detail-lead" style={{marginLeft:"6px", fontWeight:"800"}}>{product.shortDescription}</p>}
              <ExpandableDescription text={product.description} />
              {Array.isArray(product.specifications) && product.specifications.length > 0 && (
                <div className="part-tags product-detail-spec-tags">
                  {product.specifications.map((item) => (
                    <div key={`${item.label}-${item.value}`}>
                      <span>{item.label}</span>
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

              <ProductVariantSelector
                product={product}
                selectedOptionIds={selectedOptionIds}
                onChange={handleVariantChange}
              />
              {variantUnavailable && (
                <p className="variant-purchase-status" role="status">
                  {detailStockLimit < 1 ? "This option is out of stock." : "This option is currently unavailable for online purchase."}
                </p>
              )}

              <div className="detail-action-bar">
                <ProductPriceDisplay product={displayedProduct} className={appliedCoupon ? "coupon-price-applied" : ""} size="detail" showDiscountBadge />
                <div className="detail-button-group">
                  <button
                    className="book-now-button cart-secondary-button"
                    type="button"
                    onClick={addCurrentToCart}
                    disabled={!canPurchase || detailCartQuantity >= detailStockLimit}
                  >
                    {detailCartQuantity ? <Check size={18} /> : <ShoppingCart size={18} />} {detailCartQuantity ? `In Cart (${detailCartQuantity})` : "Add to Cart"}
                  </button>
                  <button className="book-now-button" type="button" onClick={bookNow} disabled={!canPurchase}>
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

        {product && !loading ? <ProductInformation product={displayedProduct || product} /> : null}

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
