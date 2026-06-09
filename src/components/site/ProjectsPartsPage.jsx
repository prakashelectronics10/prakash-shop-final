import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Check, Cpu, PackageSearch, Search, ShoppingBag, ShoppingCart, Sparkles, Tag, X } from "lucide-react";
import { apiRequest } from "../../api/client";
import { SCIENCE_PROJECTS_CATEGORY, cartStockMessage, getCartStockLimit, useCart } from "../../context/CartContext";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { OptimizedImage } from "./OptimizedImage";

const fallbackSlides = [
  {
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=80",
    title: "Electronics components for science models",
    description: "Sensors, modules, wires, motors, boards, and tools for student projects.",
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=80",
    title: "Build practical working projects",
    description: "Find reliable parts for school exhibitions, college prototypes, and hobby circuits.",
  },
];

function priceLabel(price) {
  return price === null || price === undefined || price === "" ? "Price on request" : `Rs. ${Number(price).toLocaleString("en-IN")}`;
}

export function ProjectsPartsPage() {
  const { addItem, getQuantity } = useCart();
  const [parts, setParts] = useState([]);
  const [sliders, setSliders] = useState([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [cartNotice, setCartNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [partsResponse, slidersResponse] = await Promise.all([
          apiRequest("/project-parts/public/parts?limit=200"),
          apiRequest("/project-parts/public/sliders"),
        ]);
        if (!mounted) return;
        setParts(partsResponse.data?.items || []);
        setSliders(slidersResponse.data || []);
      } catch (err) {
        if (mounted) setError(err.message || "Unable to load project parts.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const slides = useMemo(() => (sliders.length ? sliders : fallbackSlides), [sliders]);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const next = () => setActiveSlide((current) => (current + 1) % slides.length);
  const previous = () => setActiveSlide((current) => (current - 1 + slides.length) % slides.length);
  const detailHref = (part) => `/product-detail/${encodeURIComponent(part._id || part.slug || "")}`;
  const searchTerm = searchQuery.trim().toLowerCase();
  const highestPrice = useMemo(() => {
    const prices = parts.map((part) => Number(part.price)).filter((price) => Number.isFinite(price));
    return prices.length ? Math.max(...prices) : 0;
  }, [parts]);

  useEffect(() => {
    if (highestPrice && !maxPrice) setMaxPrice(String(highestPrice));
  }, [highestPrice, maxPrice]);

  const filteredParts = useMemo(() => {
    const ceiling = Number(maxPrice);
    return parts.filter((part) => {
      const searchableText = [
        part.name,
        part.category,
        part.availability,
        part.shortDescription,
        part.description,
        Array.isArray(part.tags) ? part.tags.join(" ") : "",
        part.price !== null && part.price !== undefined ? String(part.price) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const partPrice = Number(part.price);
      const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
      const matchesPrice = !Number.isFinite(ceiling) || !Number.isFinite(partPrice) || partPrice <= ceiling;

      return matchesSearch && matchesPrice;
    });
  }, [maxPrice, parts, searchTerm]);

  const resetFilters = () => {
    setSearchQuery("");
    setMaxPrice(highestPrice ? String(highestPrice) : "");
  };

  const addProjectPartToCart = (part) => {
    const result = addItem(part, {
      sourceType: "project-part",
      productCategory: SCIENCE_PROJECTS_CATEGORY,
      originalCategory: part.category || "Components",
    });
    if (result?.message) {
      setCartNotice(result.message);
      window.setTimeout(() => setCartNotice(""), 3200);
    }
  };

  return (
    <div className="App project-parts-page">
      <Navbar />
      <main>
        <section className="parts-hero">
          <div className="parts-hero-inner">
            <p className="parts-kicker"><Sparkles size={16} /> Science project shop</p>
            <h1>Science Projects and their Parts</h1>
            <h2>Now available all parts and components in our electronics shop</h2>
            <p>
              Students, parents, and project builders can now buy science project electronic parts,
              modules, sensors, motors, and supporting components directly from Prakash Electronics.
            </p>
          </div>
        </section>

        <section className="parts-slider-section" aria-label="Projects parts slider">
          <div className="parts-slider">
            {slides.map((slide, index) => (
              <article className={`parts-slide ${index === activeSlide ? "active" : ""}`} key={`${slide.title}-${index}`}>
                <OptimizedImage
                  src={slide.imageUrl}
                  alt={slide.title || "Science project components"}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : undefined}
                  width={1400}
                  height={640}
                  sizes="100vw"
                />
                <div className="parts-slide-overlay">
                  <span>Featured</span>
                  <h3>{slide.title}</h3>
                  {slide.description && <p>{slide.description}</p>}
                </div>
              </article>
            ))}
            <button className="slider-nav previous" type="button" onClick={previous} aria-label="Previous slide" style={{justifyItems:"center"}}>
              <ArrowLeft size={30} />
            </button>
            <button className="slider-nav next" type="button" onClick={next} aria-label="Next slide" style={{justifyItems:"center"}}>
              <ArrowRight size={30} />
            </button>
            <div className="slider-dots">
              {slides.map((slide, index) => (
                <button
                  type="button"
                  key={`${slide.title}-dot-${index}`}
                  className={`slider-dot-touch ${index === activeSlide ? "active" : ""}`}
                  onClick={() => setActiveSlide(index)}
                  aria-label={`Go to slide ${index + 1}`}
                >
                  <span />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="parts-products">
          <div className="parts-section-head">
            <p className="parts-kicker"><Cpu size={16} /> Components catalog</p>
            <h2>Science project parts and components</h2>
            <p>Browse available project materials with category, stock status, and price details.</p>
          </div>
          <div className="parts-catalog-toolbar">
            <label className="parts-search" htmlFor="parts-search-input">
              <Search size={18} />
              <input
                id="parts-search-input"
                type="search"
                value={searchQuery}
                placeholder="Search components, sensors, Arduino, motors..."
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear product search">
                  <X size={16} />
                </button>
              )}
            </label>
            <label className="parts-price-filter premium-price-filter">
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
            <button className="shop-reset-button parts-reset-button" type="button" onClick={resetFilters}>Reset</button>
            {!loading && !error && (
              <span className="parts-search-count">
                {filteredParts.length} of {parts.length} products
              </span>
            )}
          </div>
          {error && <div className="parts-state">{error}</div>}
          {cartNotice && <div className="cart-stock-notice shop-stock-notice">{cartNotice}</div>}
          {loading && <div className="parts-state">Loading components...</div>}
          {!loading && !error && parts.length === 0 && (
            <div className="parts-state">No science project parts are published yet.</div>
          )}
          {!loading && !error && parts.length > 0 && filteredParts.length === 0 && (
            <div className="parts-state">No components found for "{searchQuery.trim()}".</div>
          )}
          <div className="parts-grid">
            {filteredParts.map((part) => (
              <article className="part-card" key={part._id || part.slug}>
                <a className="part-card-main" href={detailHref(part)}>
                  <div className="part-image">
                    <div className="part-image-frame">
                      {part.imageUrl ? (
                        <OptimizedImage
                          src={part.imageUrl}
                          alt={part.name}
                          loading="lazy"
                          width={380}
                          height={380}
                          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                        />
                      ) : <PackageSearch size={48} />}
                    </div>
                    <span className={`part-status ${String(part.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>
                      {part.availability || "Available"}
                    </span>
                  </div>
                  <div className="part-card-body">
                    <span className="part-category">{part.category || "Components"}</span>
                    <h3>{part.name}</h3>
                    <div className="part-tags">
                      {(Array.isArray(part.tags) && part.tags.length ? part.tags.slice(0, 3) : [part.category || "Component"]).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <p>{part.shortDescription || part.description || "Science project component available in shop."}</p>
                    <small className="stock-limit-text">{cartStockMessage(part)}</small>
                  </div>
                </a>
                <div className="part-card-foot cart-card-foot">
                  {part.price !== null && part.price !== undefined ? <strong>Rs. {Number(part.price).toLocaleString("en-IN")}</strong> : <strong>Price on request</strong>}
                  <div className="product-card-actions">
                    
                    <button
                      className={`cart-icon-button ${getQuantity(part, { sourceType: "project-part" }) ? "added" : ""}`}
                      type="button"
                      onClick={() => addProjectPartToCart(part)}
                      aria-label={`Add ${part.name} to cart`}
                      title={getCartStockLimit(part) < 1 ? "Out of stock" : getQuantity(part, { sourceType: "project-part" }) >= getCartStockLimit(part) ? cartStockMessage(part) : "Add to Cart"}
                      disabled={getCartStockLimit(part) < 1 || getQuantity(part, { sourceType: "project-part" }) >= getCartStockLimit(part)}
                    >
                      {getQuantity(part, { sourceType: "project-part" }) ? <Check size={17} /> : <ShoppingCart size={17} />}
                      <span>{getCartStockLimit(part) < 1 ? "Out of Stock" : getQuantity(part, { sourceType: "project-part" }) >= getCartStockLimit(part) ? "Stock Limit" : getQuantity(part, { sourceType: "project-part" }) ? `Added (${getQuantity(part, { sourceType: "project-part" })})` : "Add to Cart"}</span>
                    </button>
                  </div>
                </div>
              </article>
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
      originalCategory: part.category || "Components",
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
      originalCategory: part.category || "Components",
    });
    if (result?.message) setError(result.message);
  };

  const detailCartQuantity = part ? getQuantity(part, { sourceType: "project-part" }) : 0;
  const detailStockLimit = part ? getCartStockLimit(part) : 0;

  return (
    <div className="App project-parts-page">
      <Navbar />
      <main className="part-detail-wrap">
        <a className="detail-back-link" href="/projects-parts">
          <ArrowLeft size={18} /> Back to project parts
        </a>

        {loading && <div className="parts-state">Loading product details...</div>}
        {error && !loading && <div className="parts-state">{error}</div>}

        {part && !loading && (
          <section className="part-detail-panel">
            <div className="part-detail-media">
              {part.imageUrl ? (
                <OptimizedImage
                  src={part.imageUrl}
                  alt={part.name}
                  width={720}
                  height={720}
                  fetchPriority="high"
                  sizes="(min-width: 1024px) 42vw, 100vw"
                />
              ) : <PackageSearch size={70} />}
              <span className={`part-status ${String(part.availability || "").toLowerCase().replace(/\s+/g, "-")}`}>
                {part.availability || "Available"}
              </span>
            </div>

            <div className="part-detail-content">
              <p className="parts-kicker"><Cpu size={16} /> Science project component</p>
              <h1>{part.name}</h1>
              <div className="detail-meta-row">
                <span><Tag size={16} /> {part.category || "Components"}</span>
                {part.stock !== undefined && <span>{cartStockMessage(part)}</span>}
              </div>
              {part.shortDescription && <p className="detail-lead">{part.shortDescription}</p>}
              <p>{part.description || "This science project component is available at Prakash Electronics."}</p>

              {Array.isArray(part.tags) && part.tags.length > 0 && (
                <div className="detail-tags">
                  {part.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}

              <div className="detail-action-bar">
                {part.price !== null && part.price !== undefined && (
                  <strong>Rs. {Number(part.price).toLocaleString("en-IN")}</strong>
                )}
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
      </main>
      <a className="science-ai-float" href="/science-ai" aria-label="Open Science AI">
        <Bot size={24} />
        <span>Science AI</span>
      </a>
      <Footer />
    </div>
  );
}
