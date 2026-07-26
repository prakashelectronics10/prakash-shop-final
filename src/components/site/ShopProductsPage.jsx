import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Bot, Check, Filter, PackageSearch, Search, ShoppingBag, ShoppingCart, Tag, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, isWiringAccessoriesCategory, cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";
import { ProductShareButton } from "./ProductShareButton";
import { EmptyProductsState, LoadingState } from "./StateLottie";
import { applyProductPageMeta, getProductSharePath } from "../../utils/productShare";

const DESCRIPTION_PREVIEW_LIMIT = 520;

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function priceLabel(price) {
  return price === null || price === undefined || price === "" ? "Price on request" : `Rs. ${Number(price).toLocaleString("en-IN")}`;
}

function searchable(product) {
  return [
    product.name,
    product.shortDescription,
    product.description,
    product.category,
    Array.isArray(product.tags) ? product.tags.join(" ") : "",
  ].filter(Boolean).join(" ").toLowerCase();
}

const ProductCard = memo(function ProductCard({ product, onAddToCart, cartQuantity }) {
  const detailUrl = getProductSharePath(product);
  const category = product.category || "Electronics";
  const stockLimit = getCartStockLimit(product);
  const atStockLimit = stockLimit > 0 && cartQuantity >= stockLimit;
  return (
    <article
      className="part-card shop-product-card"
      style={{ contentVisibility: "auto", containIntrinsicSize: "420px" }}
    >
      <ProductShareButton product={product} compact />
      <a className="part-card-main" href={detailUrl}>
        <div className="part-image shop-product-image">
          {product.imageUrl ? (
            <OptimizedImage
              src={product.imageUrl}
              alt={product.name}
              className="shop-product-card-image"
              loading="lazy"
              decoding="async"
              width={400}
              height={300}
              sizes="(min-width: 1024px) 25vw, (min-width: 760px) 50vw, 50vw"
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
        <strong>{priceLabel(product.price)}</strong>
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
  const { addItem, getQuantity } = useCart();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [productsResponse, categoriesResponse] = await Promise.all([
          apiRequest("/shop-products/public/products?limit=300"),
          apiRequest("/shop-products/public/categories"),
        ]);
        if (!mounted) return;
        setProducts(productsResponse.data?.items || []);
        setCategories(categoriesResponse.data || []);
      } catch (err) {
        if (mounted) setError(err.message || "Unable to load products.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const highestPrice = useMemo(() => {
    const prices = products.map((item) => Number(item.price)).filter((price) => Number.isFinite(price));
    return prices.length ? Math.max(...prices) : 0;
  }, [products]);

  useEffect(() => {
    if (highestPrice && !maxPrice) setMaxPrice(String(highestPrice));
  }, [highestPrice, maxPrice]);

  const filteredProducts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const ceiling = Number(maxPrice);
    return products.filter((product) => {
      const matchesSearch = !term || searchable(product).includes(term);
      const matchesCategory = !category || product.category === category;
      const productPrice = Number(product.price);
      const matchesPrice = !Number.isFinite(ceiling) || !Number.isFinite(productPrice) || productPrice <= ceiling;
      return matchesSearch && matchesCategory && matchesPrice;
    });
  }, [category, debouncedSearch, maxPrice, products]);

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
  }, [highestPrice]);

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
                  <button type="button" className="shop-filter-clear-link" onClick={() => setCategory("")}>
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
                  onClick={() => setCategory("")}
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
                    onClick={() => setCategory(item)}
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
                <span>Max {priceLabel(maxPrice || highestPrice)}</span>
                <input
                  type="range"
                  min="0"
                  max={highestPrice || 1000}
                  value={maxPrice || highestPrice || 0}
                  onChange={(event) => setMaxPrice(event.target.value)}
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
              Show {filteredProducts.length} products
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
                placeholder="Search products, tags, categories, descriptions..."
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={16} /></button>}
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
            <span className="parts-search-count shop-count">{filteredProducts.length} of {products.length} products</span>
          )}
          {cartNotice && <div className="cart-stock-notice shop-stock-notice">{cartNotice}</div>}
          {error && <div className="parts-state">{error}</div>}
          {loading && <LoadingState message="Loading products..." />}
          {!loading && !error && products.length === 0 && (
            <EmptyProductsState message="No shop products are published yet." />
          )}
          {!loading && !error && products.length > 0 && filteredProducts.length === 0 && (
            <EmptyProductsState message="No matching products found." />
          )}

          {!loading && !error && filteredProducts.length > 0 && (
            <div className="parts-grid shop-products-grid">
              {filteredProducts.map((product) => (
                <ProductCard
                  product={product}
                  key={`${product.sourceType || "shop"}-${product._id || product.sourceId || product.slug}`}
                  onAddToCart={addProductToCart}
                  cartQuantity={getQuantity(product, {
                    sourceType: product.sourceType || (isWiringAccessoriesCategory(product.category) ? "project-part" : "shop-product"),
                  })}
                />
              ))}
            </div>
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
    if (product) applyProductPageMeta(product);
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
          <a className="detail-back-link" href={source === "shop" ? "/products" : CANONICAL_WIRING_PARTS_PATH}>
            <ArrowLeft size={18} /> Back to {source === "shop" ? "products" : "wiring accessories"}
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
                  {product.tags.map((tag) => (
                    <span
                      key={tag}
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
                        transition: "transform 0.11s",
                        userSelect: "none",
                        cursor: "pointer"
                      }}
                      onMouseOver={e => (e.currentTarget.style.transform = "scale(1.06)")}
                      onMouseOut={e => (e.currentTarget.style.transform = "scale(1)")}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
         
              <div className="detail-action-bar">
                <strong>{priceLabel(product.price)}</strong>
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
      </main>
      <Footer />
    </div>
  );
}
