import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Bot, Check, Filter, PackageSearch, Search, ShoppingBag, ShoppingCart, Tag, X, Zap } from "lucide-react";
import { apiRequest } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
import { useSwipeNavigation } from "../../hooks/useSwipeNavigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import { ProductShareButton } from "./ProductShareButton";
import { ProductPriceDisplay } from "./ProductPriceDisplay";
import { ProgressSliderDots } from "./ProgressSliderDots";
import { RelatedProductsSection } from "./RelatedProductsSection";
import { CatalogGridSkeleton, EmptyProductsState, LoadingState } from "./StateLottie";
import { applyProductPageMeta, getProductSharePath } from "../../utils/productShare";
import { trackProductPageView } from "../../utils/productViews";
import {
  formatTagQuery,
  getTagSearchHref,
  normalizeTag,
  productMatchesSearch,
  readSearchQueryFromLocation,
} from "../../utils/productSearch";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { useCatalogPageSize, useWindowedItems } from "../../hooks/useWindowedItems";
import {
  CATALOG_CACHE_TTL_MS,
  WIRING_CATALOG_CACHE_KEY,
  readCatalogCache,
  writeCatalogCache,
} from "../../utils/catalogCache";

const fallbackSlides = [
  {
    imageUrl: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=1400&q=80",
    title: "Wiring accessories for every home",
    description: "Switches, sockets, wires, MCBs, and trusted electrical brands.",
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1400&q=80",
    title: "Premium electrical fittings",
    description: "Browse wiring products by category and brand with clear stock details.",
  },
];

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

const WiringPartCard = memo(function WiringPartCard({ part, onAddToCart, cartQuantity, eager = false }) {
  const detailUrl = getProductSharePath(part);
  const stockLimit = getCartStockLimit(part);
  const atStockLimit = stockLimit > 0 && cartQuantity >= stockLimit;

  return (
    <article className="part-card">
      <ProductShareButton product={part} compact />
      <a className="part-card-main" href={detailUrl}>
        <div className="part-image project-part-image">
          {part.imageUrl ? (
            <OptimizedImage
              src={part.imageUrl}
              alt={part.name}
              className="project-part-card-image"
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={eager ? "high" : undefined}
              width={280}
              height={210}
              sizes="(min-width: 1024px) 25vw, (min-width: 760px) 50vw, 46vw"
            />
          ) : <PackageSearch size={48} />}
          <span className={`part-status ${String(part.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>
            {part.availability || "Available"}
          </span>
        </div>
        <div className="part-card-body">
          <span className="part-category">{part.category || "Wiring Products"}</span>
          {part.subCategory ? <span className="part-subcategory">{part.subCategory}</span> : null}
          <h3>{part.name}</h3>
          <div className="part-tags" />
          <p>{part.shortDescription || part.description || "Wiring accessory available in shop."}</p>
          <small className="stock-limit-text">{cartStockMessage(part)}</small>
        </div>
      </a>
      <div className="part-card-foot cart-card-foot">
        <ProductPriceDisplay product={part} size="card" />
        <div className="product-card-actions">
          <button
            className={`cart-icon-button ${cartQuantity ? "added" : ""}`}
            type="button"
            onClick={() => onAddToCart(part)}
            aria-label={`Add ${part.name} to cart`}
            title={stockLimit < 1 ? "Out of stock" : atStockLimit ? cartStockMessage(part) : "Add to Cart"}
            disabled={stockLimit < 1 || atStockLimit}
          >
            {cartQuantity ? <Check size={17} /> : <ShoppingCart size={17} />}
            <span>
              {stockLimit < 1
                ? "Out of Stock"
                : atStockLimit
                  ? "Stock Limit"
                  : cartQuantity
                    ? `Added (${cartQuantity})`
                    : "Add to Cart"}
            </span>
          </button>
        </div>
      </div>
    </article>
  );
});

export function ProjectsPartsPage() {
  const { addItem, getQuantity } = useCart();
  const cachedCatalog = useMemo(
    () => readCatalogCache(WIRING_CATALOG_CACHE_KEY, { ttlMs: CATALOG_CACHE_TTL_MS, allowStale: true }),
    [],
  );
  const [parts, setParts] = useState(() => cachedCatalog?.data?.parts || []);
  const [sliders, setSliders] = useState(() => cachedCatalog?.data?.sliders || []);
  const [taxonomy, setTaxonomy] = useState(() => cachedCatalog?.data?.taxonomy || { categories: [], subCategoriesByCategory: {} });
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(() => !(cachedCatalog?.data?.parts?.length));
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState(() => readSearchQueryFromLocation());
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const [sliderInView, setSliderInView] = useState(true);
  const sliderSectionRef = useRef(null);
  const debouncedSearch = useDebouncedValue(searchQuery);
  const gridPageSize = useCatalogPageSize(12, 30);

  useEffect(() => {
    const fromUrl = readSearchQueryFromLocation();
    if (fromUrl) setSearchQuery(fromUrl);
  }, []);

  useEffect(() => {
    let mounted = true;
    const hadCache = Boolean(cachedCatalog?.data?.parts?.length);
    async function load() {
      try {
        const [partsResponse, slidersResponse, taxonomyResponse] = await Promise.all([
          apiRequest("/project-parts/public/parts?limit=120", { cacheTtl: CATALOG_CACHE_TTL_MS }),
          apiRequest("/project-parts/public/sliders", { cacheTtl: CATALOG_CACHE_TTL_MS }),
          apiRequest("/project-parts/public/taxonomy", { cacheTtl: CATALOG_CACHE_TTL_MS }),
        ]);
        if (!mounted) return;
        const nextParts = partsResponse.data?.items || [];
        const nextSliders = slidersResponse.data || [];
        const nextTaxonomy = {
          categories: taxonomyResponse.data?.categories || [],
          subCategoriesByCategory: taxonomyResponse.data?.subCategoriesByCategory || {},
        };
        setParts(nextParts);
        setSliders(nextSliders);
        setTaxonomy(nextTaxonomy);
        writeCatalogCache(WIRING_CATALOG_CACHE_KEY, {
          parts: nextParts,
          sliders: nextSliders,
          taxonomy: nextTaxonomy,
        });
        setError("");
      } catch (err) {
        if (mounted && !hadCache) setError(err.message || "Unable to load wiring accessories.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [cachedCatalog]);

  useEffect(() => {
    const node = sliderSectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        setSliderInView(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: "80px 0px", threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const slides = useMemo(() => (sliders.length ? sliders : fallbackSlides), [sliders]);

  const goWiringSlide = useCallback((dir) => {
    setActiveSlide((current) => {
      const total = slides.length || 1;
      return (current + dir + total) % total;
    });
  }, [slides.length]);

  const wiringSwipe = useSwipeNavigation({
    enabled: slides.length > 1,
    onSwipeLeft: () => goWiringSlide(1),
    onSwipeRight: () => goWiringSlide(-1),
  });

  const categories = useMemo(() => {
    if (taxonomy.categories.length) return taxonomy.categories;
    return [...new Set(parts.map((part) => String(part.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [parts, taxonomy.categories]);

  const brandOptions = useMemo(() => {
    if (!category) return [];
    const fromTaxonomy = taxonomy.subCategoriesByCategory?.[category];
    if (Array.isArray(fromTaxonomy) && fromTaxonomy.length) return fromTaxonomy;
    return [...new Set(
      parts
        .filter((part) => part.category === category)
        .map((part) => String(part.subCategory || "").trim())
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b));
  }, [category, parts, taxonomy.subCategoriesByCategory]);

  useEffect(() => {
    if (subCategory && category && !brandOptions.includes(subCategory)) {
      setSubCategory("");
    }
  }, [brandOptions, category, subCategory]);

  const filteredParts = useMemo(() => {
    return parts.filter((part) => {
      const matchesSearch = productMatchesSearch(part, debouncedSearch, [
        part.price !== null && part.price !== undefined ? String(part.price) : "",
      ]);
      const matchesCategory = !category || part.category === category;
      const matchesBrand = !subCategory || part.subCategory === subCategory;
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }, [category, parts, debouncedSearch, subCategory]);

  const { visibleItems: visibleParts, hasMore: hasMoreParts, sentinelRef: partsGridSentinelRef } = useWindowedItems(
    filteredParts,
    { pageSize: gridPageSize, rootMargin: "200px 0px" },
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (category) count += 1;
    if (subCategory) count += 1;
    return count;
  }, [category, subCategory]);

  const closeFilters = useCallback(() => setFilterOpen(false), []);

  const resetSheetFilters = useCallback(() => {
    setCategory("");
    setSubCategory("");
  }, []);

  const selectCategory = useCallback((nextCategory) => {
    setCategory(nextCategory);
    setSubCategory("");
  }, []);

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

  const addProjectPartToCart = useCallback((part) => {
    const result = addItem(part, {
      sourceType: "project-part",
      productCategory: SCIENCE_PROJECTS_CATEGORY,
      originalCategory: part.category || "Wiring Products",
    });
    if (result?.message) {
      setCartNotice(result.message);
      window.setTimeout(() => setCartNotice(""), 3200);
    }
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
          aria-labelledby="wiring-filter-sheet-title"
        >
          <div className="shop-filter-sheet-handle" aria-hidden="true" />
          <div className="shop-filter-sheet-header">
            <div>
              <p className="shop-filter-sheet-kicker">Refine results</p>
              <h3 id="wiring-filter-sheet-title">Filters</h3>
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
                  <button type="button" className="shop-filter-clear-link" onClick={() => selectCategory("")}>
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
                  onClick={() => selectCategory("")}
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
                    onClick={() => selectCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            <section className="shop-filter-section">
              <div className="shop-filter-section-head">
                <h4>Sub-categories (Brands)</h4>
                {subCategory ? (
                  <button type="button" className="shop-filter-clear-link" onClick={() => setSubCategory("")}>
                    Clear
                  </button>
                ) : null}
              </div>
              {!category ? (
                <p className="wiring-filter-hint">Select a category first to choose a brand.</p>
              ) : brandOptions.length === 0 ? (
                <p className="wiring-filter-hint">No brands listed for this category yet. All products in this category will show.</p>
              ) : (
                <div className="shop-filter-category-list" role="listbox" aria-label="Filter by brand">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!subCategory}
                    className={`shop-filter-category-chip ${!subCategory ? "selected" : ""}`}
                    onClick={() => setSubCategory("")}
                  >
                    All Brands
                  </button>
                  {brandOptions.map((item) => (
                    <button
                      type="button"
                      key={item}
                      role="option"
                      aria-selected={subCategory === item}
                      className={`shop-filter-category-chip ${subCategory === item ? "selected" : ""}`}
                      onClick={() => setSubCategory(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="shop-filter-sheet-footer">
            <button className="shop-filter-sheet-reset" type="button" onClick={resetSheetFilters}>
              Reset
            </button>
            <button className="shop-filter-sheet-apply" type="button" onClick={closeFilters}>
              Show {filteredParts.length} products
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="App project-parts-page wiring-accessories-page">
      <Navbar />
      <main>
        <section className="parts-page-intro">
          <div className="parts-page-intro-inner">
            <a className="detail-back-link catalog-page-back" href="/">
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Back to home</span>
            </a>
            <p className="parts-kicker"><Zap size={16} /> Wiring accessories</p>
            <h1>Wiring Accessories</h1>
            <p>Browse switches, sockets, wires, MCBs, and electrical fittings by category and brand from Prakash Electronics.</p>
          </div>
        </section>

        <section
          className="parts-slider-section"
          aria-label="Wiring accessories slider"
          ref={sliderSectionRef}
        >
          <div
            className="parts-slider"
            onPointerDown={wiringSwipe.onPointerDown}
            onPointerUp={wiringSwipe.onPointerUp}
            onPointerCancel={wiringSwipe.onPointerCancel}
            style={wiringSwipe.style}
          >
            {slides.map((slide, index) => {
              const isNear = Math.abs(index - activeSlide) <= 1
                || (activeSlide === 0 && index === slides.length - 1)
                || (activeSlide === slides.length - 1 && index === 0);
              return (
                <article
                  className={`parts-slide ${index === activeSlide ? "active" : ""}`}
                  key={`${slide.title}-${index}`}
                >
                  {isNear ? (
                    <OptimizedImage
                      src={slide.imageUrl}
                      alt={slide.title || "Wiring accessories"}
                      loading={index === activeSlide ? "eager" : "lazy"}
                      fetchPriority={index === activeSlide ? "high" : undefined}
                      width={720}
                      height={440}
                      sizes="(max-width: 760px) 100vw, 1180px"
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
          <ProgressSliderDots
            count={slides.length}
            activeIndex={activeSlide}
            onChange={setActiveSlide}
            intervalMs={4500}
            autoPlay={sliderInView}
            className="parts-progress-dots"
            ariaLabel="Wiring accessories slides"
          />
        </section>

        <section className="parts-products">
          <div className="parts-section-head">
            <p className="parts-kicker"><PackageSearch size={16} /> Product catalog</p>
            
          </div>

          <div className="shop-filter-panel wiring-filter-panel">
            <label className="parts-search shop-search" htmlFor="wiring-search-input">
              <Search size={18} />
              <input
                id="wiring-search-input"
                type="search"
                value={searchQuery}
                placeholder="Search products or #tags (e.g. #switch)..."
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear product search">
                  <X size={16} />
                </button>
              )}
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

          {!loading && !error && (
            <span className="parts-search-count shop-count">
              {filteredParts.length} of {parts.length} products
            </span>
          )}
          {error && <div className="parts-state">{error}</div>}
          {cartNotice && <div className="cart-stock-notice shop-stock-notice">{cartNotice}</div>}
          {loading && <CatalogGridSkeleton count={gridPageSize === 12 ? 6 : 8} />}
          {!loading && !error && parts.length === 0 && (
            <EmptyProductsState message="No wiring accessories are published yet." />
          )}
          {!loading && !error && parts.length > 0 && filteredParts.length === 0 && (
            <EmptyProductsState message="No matching wiring products found." />
          )}
          {!loading && !error && filteredParts.length > 0 && (
            <>
              <div className="parts-grid">
                {visibleParts.map((part, index) => (
                  <WiringPartCard
                    key={part._id || part.slug}
                    part={part}
                    onAddToCart={addProjectPartToCart}
                    cartQuantity={getQuantity(part, { sourceType: "project-part" })}
                    eager={index < 4}
                  />
                ))}
              </div>
              {hasMoreParts ? <div ref={partsGridSentinelRef} aria-hidden="true" style={{ height: 1 }} /> : null}
            </>
          )}
        </section>
      </main>
      {filterSheet}
      <a className="science-ai-float" href="/pulse-ai" aria-label="Open Pulse AI">
        <Bot size={24} />
        <span>Pulse AI</span>
      </a>
      <Footer />
    </div>
  );
}

export function ProjectPartDetailPage() {
  const { addItem, getQuantity } = useCart();
  const params = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const pathId = pathParts[0] === "product-detail" ? pathParts[1] : "";
  const slug = pathId || params.get("slug") || "";
  const [part, setPart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadPart() {
      if (!slug) {
        setError("Product detail link is missing.");
        setLoading(false);
        return;
      }

      try {
        const response = await apiRequest(`/project-parts/public/parts/${encodeURIComponent(slug)}`);
        if (mounted) setPart(response.data || null);
      } catch (err) {
        if (mounted) setError(err.message || "Product not found.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadPart();
    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    if (part) {
      applyProductPageMeta(part);
      trackProductPageView(part);
    }
  }, [part]);

  const bookNow = () => {
    if (!part) return;
    if (getCartStockLimit(part) < 1) {
      setError("This product is out of stock.");
      return;
    }
    sessionStorage.setItem("selectedProjectPartBooking", JSON.stringify({
      productId: part._id || "",
      sourceId: part._id || "",
      sourceType: "project-part",
      productSlug: part.slug || "",
      productName: part.name || "",
      productCategory: SCIENCE_PROJECTS_CATEGORY,
      originalCategory: part.category || "Wiring Products",
      productImageUrl: part.imageUrl || "",
      productDescription: part.description || part.shortDescription || "",
      bookingSource: "product-detail",
      quantity: 1,
      stockQuantity: getCartStockLimit(part),
      price: part.price ?? null,
    }));
    window.location.href = "/booking?source=product-detail";
  };

  const addCurrentToCart = () => {
    if (!part) return;
    const result = addItem(part, {
      sourceType: "project-part",
      productCategory: SCIENCE_PROJECTS_CATEGORY,
      originalCategory: part.category || "Wiring Products",
    });
    if (result?.message) setError(result.message);
  };

  const detailCartQuantity = part ? getQuantity(part, { sourceType: "project-part" }) : 0;
  const detailStockLimit = part ? getCartStockLimit(part) : 0;

  return (
    <div className="App project-parts-page wiring-accessories-page">
      <Navbar />
      <main className="part-detail-wrap">
        <div className="detail-header-row">
          <a className="detail-back-link catalog-page-back" href={CANONICAL_WIRING_PARTS_PATH}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back to wiring accessories</span>
          </a>
        </div>

        {loading && <LoadingState message="Loading product details..." className="site-state-lottie--detail" />}
        {error && !loading && <div className="parts-state">{error}</div>}

        {part && !loading && (
          <section className="part-detail-panel">
            <div className="part-detail-media">
              <ProductShareButton product={part} compact />
              {part.imageUrl ? (
                <OptimizedImage
                  src={part.imageUrl}
                  alt={part.name}
                  className="part-detail-image"
                  width={720}
                  height={540}
                  fetchPriority="high"
                  sizes="(min-width: 1024px) 42vw, 100vw"
                />
              ) : <PackageSearch size={70} />}
              <span className={`part-status ${String(part.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>
                {part.availability || "Available"}
              </span>
            </div>

            <div className="part-detail-content">
              <p className="parts-kicker"><Zap size={16} /> Wiring accessory</p>
              <h1>{part.name}</h1>
              <div className="detail-meta-row">
                <span><Tag size={16} /> {part.category || "Wiring Products"}</span>
                {part.subCategory ? <span>{part.subCategory}</span> : null}
                {part.stock !== undefined && <span>{cartStockMessage(part)}</span>}
              </div>
              {part.shortDescription && <p className="detail-lead">{part.shortDescription}</p>}
              <p>{part.description || "This wiring accessory is available at Prakash Electronics."}</p>

              {Array.isArray(part.tags) && part.tags.length > 0 && (
                <div className="detail-tags">
                  {part.tags.map((tag) => {
                    const label = formatTagQuery(tag) || `#${normalizeTag(tag)}`;
                    return (
                      <a
                        key={tag}
                        href={getTagSearchHref(tag, { catalog: "wiring-parts" })}
                        className="detail-tag-link"
                        aria-label={`Search wiring products with tag ${label}`}
                      >
                        {label}
                      </a>
                    );
                  })}
                </div>
              )}

              <div className="detail-action-bar">
                <ProductPriceDisplay product={part} size="detail" showDiscountBadge />
                <div className="detail-button-group">
                  <button
                    className="book-now-button cart-secondary-button"
                    type="button"
                    onClick={addCurrentToCart}
                    disabled={detailStockLimit < 1 || (detailStockLimit > 0 && detailCartQuantity >= detailStockLimit)}
                  >
                    {detailCartQuantity ? <Check size={18} /> : <ShoppingCart size={18} />}
                    {detailCartQuantity ? `In Cart (${detailCartQuantity})` : "Add to Cart"}
                  </button>
                  <button className="book-now-button" type="button" onClick={bookNow} disabled={detailStockLimit < 1}>
                    <ShoppingBag size={18} /> Book Now
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {part && !loading ? (
          <RelatedProductsSection product={part} sourceType="project-part" limit={8} />
        ) : null}
      </main>
      <a className="science-ai-float" href="/pulse-ai" aria-label="Open Pulse AI">
        <Bot size={24} />
        <span>Pulse AI</span>
      </a>
      <Footer />
    </div>
  );
}
