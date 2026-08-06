import { useEffect, useState } from "react";
import { ArrowRight, Flame } from "lucide-react";
import { apiRequest } from "../../api/client";
import { ShowcaseProductCard, ShowcaseProductSkeleton } from "./ShowcaseProductCard";
import { CATALOG_CACHE_TTL_MS } from "../../utils/catalogCache";

function useShowcaseVisibleCount() {
  const [count, setCount] = useState(8);

  useEffect(() => {
    const update = () => {
      if (window.matchMedia("(max-width: 767px)").matches) setCount(4);
      else if (window.matchMedia("(max-width: 1023px)").matches) setCount(6);
      else setCount(8);
    };
    update();
    const mobile = window.matchMedia("(max-width: 767px)");
    const tablet = window.matchMedia("(max-width: 1023px)");
    mobile.addEventListener("change", update);
    tablet.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
    };
  }, []);

  return count;
}

export function TrendingProducts({ sectionId = "trending" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const visibleCount = useShowcaseVisibleCount();

  useEffect(() => {
    let mounted = true;
    apiRequest("/shop-products/public/trending?limit=6", { cacheTtl: CATALOG_CACHE_TTL_MS })
      .then((response) => {
        if (!mounted) return;
        setItems(Array.isArray(response?.data?.items) ? response.data.items : []);
      })
      .catch(() => {
        if (mounted) setItems([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!loading && !items.length) return null;

  const visibleItems = items.slice(0, visibleCount);

  return (
    <section id={sectionId || undefined} className="site-section relative">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
              <Flame className="h-3.5 w-3.5" />
              Most viewed
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              Trending <span className="text-gradient">Products</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Top products customers are checking right now, ranked by real product page views.
            </p>
          </div>
          <a href="/products" className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            Browse all products <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        {loading ? (
          <div className="showcase-products-grid" aria-hidden="true">
            {Array.from({ length: Math.min(4, visibleCount) }).map((_, index) => (
              <ShowcaseProductSkeleton key={`skeleton-${index}`} />
            ))}
          </div>
        ) : (
          <div className="showcase-products-grid">
            {visibleItems.map((product, index) => (
              <ShowcaseProductCard
                key={product._id || product.slug || index}
                product={product}
                rank={index + 1}
                eager={index < 2}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** @deprecated Use TrendingProducts — kept for any stale imports */
export const Stats = TrendingProducts;
