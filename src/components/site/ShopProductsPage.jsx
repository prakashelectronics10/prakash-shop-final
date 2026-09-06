import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Bot, Check, Filter, PackageSearch, Search, ShoppingBag, ShoppingCart, Tag, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, isWiringAccessoriesCategory, cartStockMessage, getCartStockLimit, useCart, useCartActions, useCartQuantity } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import { ProductShareButton } from "./ProductShareButton";
import { ProductPriceDisplay } from "./ProductPriceDisplay";
import { CatalogPagination } from "./CatalogPagination";
import { RelatedProductsSection } from "./RelatedProductsSection";
import { CatalogGridSkeleton, EmptyProductsState, LoadingState } from "./StateLottie";
import { applyProductPageMeta, getProductSharePath } from "../../utils/productShare";
import { trackProductPageView } from "../../utils/productViews";
import {
  formatTagQuery,
  getTagSearchHref,
  normalizeTag,
  readSearchQueryFromLocation,
} from "../../utils/productSearch";
import { formatINR } from "../../utils/productPricing";
import { useCatalogPageSize } from "../../hooks/useWindowedItems";
import {
  CATALOG_CACHE_TTL_MS,
  SHOP_CATALOG_CACHE_KEY,
  readCatalogCache,
  writeCatalogCache,
} from "../../utils/catalogCache";

const DESCRIPTION_PREVIEW_LIMIT = 520;

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
              width={280}
              height={210}
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
  const [search, setSearch] = useState(() => readSearchQueryFromLocation());
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const gridPageSize = useCatalogPageSize(12, 30);

  useEffect(() => {
    const fromUrl = readSearchQueryFromLocation();
    if (fromUrl) setSearch(fromUrl);
  }, []);

  useEffect(() => {
    let mounted = true;
    const hadCache = Boolean(cachedCatalog?.data?.products?.length);
    async function load() {
      try {
        setLoading(true);
        const query = new URLSearchParams({
          page: String(page),
          limit: String(gridPageSize),
        });
        if (debouncedSearch) query.set("search", debouncedSearch);
        if (category) query.set("category", category);
        if (highestPrice && maxPrice && Number(maxPrice) < highestPrice) {
          query.set("maxPrice", maxPrice);
        }
        const [productsResponse, categoriesResponse] = await Promise.all([
          apiRequest(`/shop-products/public/products?${query.toString()}`, { cacheTtl: CATALOG_CACHE_TTL_MS }),
          apiRequest("/shop-products/public/categories", { cacheTtl: CATALOG_CACHE_TTL_MS }),
        ]);
        if (!mounted) return;
        const nextProducts = productsResponse.data?.items || [];
        const nextCategories = categoriesResponse.data || [];
        setProducts(nextProducts);
        setCategories(nextCategories);
        setCatalogTotal(productsResponse.data?.total || 0);
        setCatalogPages(productsResponse.data?.pages || 1);
        if (!highestPrice) setHighestPrice(productsResponse.data?.maxPrice || 0);
        writeCatalogCache(SHOP_CATALOG_CACHE_KEY, {
          products: nextProducts,
          categories: nextCategories,
          page,
          total: productsResponse.data?.total || 0,
          pages: productsResponse.data?.pages || 1,
          maxPrice: productsResponse.data?.maxPrice || highestPrice || 0,
        });
        setError("");
      } catch (err) {
        if (mounted && !hadCache) setError(err.message || "Unable to load products.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [cachedCatalog, category, debouncedSearch, gridPageSize, highestPrice, maxPrice, page]);

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

  const resetSheetFilters = useCallback(() => {
    setCategory("");
    setMaxPrice(highestPrice ? String(highestPrice) : "");
    setPage(1);
  }, [highestPrice]);

  const goToPage = useCallback((nextPage) => {
    const safePage = Math.min(Math.max(1, Number(nextPage) || 1), Math.max(1, catalogPages));
    setPage(safePage);
    document.querySelector(".parts-products")?.scrollIntoView({ block: "start" });
  }, [catalogPages]);

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
                  <button type="button" className="shop-filter-clear-link" onClick={() => { setCategory(""); setPage(1); }}>
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
                  onClick={() => { setCategory(""); setPage(1); }}
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
                    onClick={() => { setCategory(item); setPage(1); }}
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
                  onChange={(event) => { setMaxPrice(event.target.value); setPage(1); }}
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
              Show {catalogTotal} products
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
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              />
              {search && <button type="button" onClick={() => { setSearch(""); setPage(1); }} aria-label="Clear search"><X size={16} /></button>}
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
            <span className="parts-search-count shop-count">{catalogTotal} products</span>
          )}
          {cartNotice && <div className="cart-stock-notice shop-stock-notice">{cartNotice}</div>}
          {error && <div className="parts-state">{error}</div>}
          {loading && <CatalogGridSkeleton count={gridPageSize === 12 ? 6 : 8} />}
          {!loading && !error && products.length === 0 && (
            <EmptyProductsState message="No shop products are published yet." />
          )}
          {!loading && !error && catalogTotal > 0 && products.length === 0 && (
            <EmptyProductsState message="No matching products found." />
          )}

          {!loading && !error && products.length > 0 && (
            <>
              <div className="parts-grid shop-products-grid">
                {products.map((product, index) => (
                  <ProductCard
                    product={product}
                    key={`${product.sourceType || "shop"}-${product._id || product.sourceId || product.slug}`}
                    onAddToCart={addProductToCart}
                    eager={index < 4}
                  />
                ))}
              </div>
              <CatalogPagination
                page={page}
                pages={catalogPages}
                total={catalogTotal}
                pageSize={gridPageSize}
                loading={loading}
                onPageChange={goToPage}
              />
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

export function ProductDetailPage() {
  const { addItem, getQuantity } = useCart();
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const id = pathParts[0] === "product-detail" ? pathParts[1] : "";
  const [product, setProduct] = useState(null);
  const [source, setSource] = useState("shop");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    if (product) {
      applyProductPageMeta(product);
      trackProductPageView(product);
    }
  }, [product]);

  const bookNow = () => {
    if (!product) return;
    if (getCartStockLimit(product) < 1) {
      setError("This product is out of stock.");
      return;
    }
    const isProjectPart = source === "project-part" || product.sourceType === "project-part";
    sessionStorage.setItem("selectedProjectPartBooking", JSON.stringify({
      productId: product._id || "",
      sourceId: product.sourceId || product._id || "",
      sourceType: isProjectPart ? "project-part" : "shop-product",
      productSlug: product.slug || "",
      productName: product.name || "",
      productCategory: isProjectPart ? SCIENCE_PROJECTS_CATEGORY : product.category || "Electronics",
      originalCategory: product.originalCategory || (isProjectPart ? product.category : ""),
      productImageUrl: product.imageUrl || "",
      productDescription: product.description || product.shortDescription || "",
      bookingSource: source === "shop" ? "shop-product-detail" : "product-detail",
      quantity: 1,
      stockQuantity: getCartStockLimit(product),
      price: product.price ?? null,
    }));
    window.location.href = "/booking?source=product-detail";
  };

  const addCurrentToCart = () => {
    if (!product) return;
    const result = addItem(product, {
      sourceType: source === "project-part" || product.sourceType === "project-part" ? "project-part" : "shop-product",
    });
    if (result?.message) setError(result.message);
  };

  const detailCartQuantity = product ? getQuantity(product, {
    sourceType: source === "project-part" || product.sourceType === "project-part" ? "project-part" : "shop-product",
  }) : 0;
  const detailStockLimit = product ? getCartStockLimit(product) : 0;

  return (
    <div className="App project-parts-page shop-products-page">
      <Navbar />
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
        {loading && <LoadingState message="Loading product details..." className="site-state-lottie--detail" />}
        {error && !loading && <div className="parts-state">{error}</div>}

        {product && !loading && (
          <section className="part-detail-panel">
            <div className="part-detail-media">
              <ProductShareButton product={product} compact />
              {product.imageUrl ? (
                <OptimizedImage
                  src={product.imageUrl}
                  alt={product.name}
                  className="part-detail-image"
                  width={720}
                  height={540}
                  decoding="async"
                  fetchPriority="high"
                  sizes="(min-width: 1024px) 42vw, 100vw"
                />
              ) : <PackageSearch size={70} />}
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
                          boxShadow: "0 1px 6px 0 rgba(253,224,102,0.18)",
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
                <ProductPriceDisplay product={product} size="detail" showDiscountBadge />
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
