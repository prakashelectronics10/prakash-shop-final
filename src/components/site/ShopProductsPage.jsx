import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, Check, ChevronDown, Filter, PackageSearch, Search, ShoppingBag, ShoppingCart, Tag, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";

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

function GlassSelect({ value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className={`site-glass-select ${open ? "open" : ""}`}>
      <button
        type="button"
        className="site-glass-select-trigger"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected.label}</span>
        <ChevronDown size={16} />
      </button>
      <div className="site-glass-select-menu" role="listbox">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={option.value === value ? "selected" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            role="option"
            aria-selected={option.value === value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const ProductCard = memo(function ProductCard({ product, onAddToCart, cartQuantity }) {
  const detailUrl = `/product-detail/${encodeURIComponent(product._id || product.sourceId || product.slug)}`;
  const category = product.category || "Electronics";
  const stockLimit = getCartStockLimit(product);
  const atStockLimit = stockLimit > 0 && cartQuantity >= stockLimit;
  return (
    <article
      className="part-card shop-product-card"
      style={{ contentVisibility: "auto", containIntrinsicSize: "420px" }}
    >
      <a className="part-card-main" href={detailUrl}>
        <div className="part-image shop-product-image" style={{width:"100%", height:"250px", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center"}}>
          {product.imageUrl ? (
            <OptimizedImage
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              width={320}
              height={320}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            />
          ) : <PackageSearch size={48} />}
          <span className={`part-status ${String(product.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>{product.availability || "Available"}</span>
        </div>
        <div className="part-card-body">
          <span className="part-category">{category}</span>
          <h3>{product.name}</h3>
          <p>{product.shortDescription || product.description || "Product available in shop."}</p>
          <div className="part-tags">
            {(Array.isArray(product.tags) && product.tags.length ? product.tags.slice(0, 3) : [category || "Product"]).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <small className="stock-limit-text">{cartStockMessage(product)}</small>
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

export function ShopProductsPage() {
  const { addItem, getQuantity } = useCart();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
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

  const categoryOptions = useMemo(
    () => [{ value: "", label: "All Categories" }, ...categories.map((item) => ({ value: item, label: item }))],
    [categories],
  );

  const resetFilters = useCallback(() => {
    setSearch("");
    setCategory("");
    setMaxPrice(highestPrice ? String(highestPrice) : "");
  }, [highestPrice]);

  const addProductToCart = useCallback((product) => {
    const result = addItem(product, {
      sourceType: product.sourceType || (product.category === SCIENCE_PROJECTS_CATEGORY ? "project-part" : "shop-product"),
    });
    if (result?.message) {
      setCartNotice(result.message);
      window.setTimeout(() => setCartNotice(""), 3200);
    }
  }, [addItem]);

  return (
    <div className="App project-parts-page shop-products-page">
      <Navbar />
      <main>
        <section className="parts-hero shop-hero">
          <div className="parts-hero-inner">
            <p className="parts-kicker"><ShoppingBag size={16} /> Public shop products</p>
            <h1>Shop Products</h1>
            <h2>Browse electronics products, wiring accessories, home applience, and useful Products from Prakash Electronics.</h2>
            <p>Search by product name, keywords, description, or category and Reset all applied fiter by reset button.</p>
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

            <label className="shop-select-filter">
              <Filter size={16} />
              <GlassSelect
                value={category}
                onChange={setCategory}
                ariaLabel="Filter by category"
                options={categoryOptions}
              />
            </label>

            <label className="shop-price-filter">
              <span>Max {priceLabel(maxPrice || highestPrice)}</span>
              <input
                type="range"
                min="0"
                max={highestPrice || 1000}
                value={maxPrice || highestPrice || 0}
                onChange={(event) => setMaxPrice(event.target.value)}
              />
            </label>

            <button className="shop-reset-button" type="button" onClick={resetFilters}>Reset</button>
          </div>

          {!loading && !error && (
            <span className="parts-search-count shop-count">{filteredProducts.length} of {products.length} products</span>
          )}
          {cartNotice && <div className="cart-stock-notice shop-stock-notice">{cartNotice}</div>}
          {error && <div className="parts-state">{error}</div>}
          {loading && <div className="parts-state">Loading products...</div>}
          {!loading && !error && products.length === 0 && <div className="parts-state">No shop products are published yet.</div>}
          {!loading && !error && products.length > 0 && filteredProducts.length === 0 && <div className="parts-state">No matching products found.</div>}

          <div className="parts-grid shop-products-grid">
            {filteredProducts.map((product) => (
              <ProductCard
                product={product}
                key={`${product.sourceType || "shop"}-${product._id || product.sourceId || product.slug}`}
                onAddToCart={addProductToCart}
                cartQuantity={getQuantity(product, {
                  sourceType: product.sourceType || (product.category === SCIENCE_PROJECTS_CATEGORY ? "project-part" : "shop-product"),
                })}
              />
            ))}
          </div>
        </section>
      </main>
      <a className="science-ai-float" href="/science-ai" aria-label="Open Science AI">
        <Bot size={24} />
        <span>Science AI</span>
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
        <a className="detail-back-link" href={source === "shop" ? "/products" : "/projects-parts"}>
          <ArrowLeft size={18} /> Back to {source === "shop" ? "products" : "project parts"}
        </a>
        {loading && <div className="parts-state">Loading product details...</div>}
        {error && !loading && <div className="parts-state">{error}</div>}

        {product && !loading && (
          <section className="part-detail-panel">
            <div className="part-detail-media">
              {product.imageUrl ? (
                <OptimizedImage
                  src={product.imageUrl}
                  alt={product.name}
                  width={720}
                  height={720}
                  decoding="async"
                  fetchPriority="high"
                  sizes="(min-width: 1024px) 42vw, 100vw"
                />
              ) : <PackageSearch size={70} />}
              <span className={`part-status ${String(product.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>{product.availability || "Available"}</span>
            </div>

            <div className="part-detail-content">
              <p className="parts-kicker"><ShoppingBag size={16} /> {source === "shop" ? "Shop product" : "Science project component"}</p>
              <h1>{product.name}</h1>
              <div className="detail-meta-row" style={{marginBottom:"15px"}}>
                <span><Tag size={16} /> {product.category || "Electronics"}</span>
                {product.originalCategory && <span>{product.originalCategory}</span>}
                {product && <span>{cartStockMessage(product)}</span>}
              </div>
              {product.shortDescription && <p className="detail-lead" style={{marginLeft:"6px", fontWeight:"800"}}>{product.shortDescription}</p>}
              <p style={{marginLeft:"6px"}}>{product.description || "This product is available at Prakash Electronics."}</p>
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
                <div className="detail-tags">{product.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
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
                    <ShoppingBag size={18} /> Book Now
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
