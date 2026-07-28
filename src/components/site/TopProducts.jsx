import { useEffect, useState } from "react";
import { ArrowRight, Star } from "lucide-react";
import { apiRequest } from "../../api/client";
import { ShowcaseProductCard, ShowcaseProductSkeleton } from "./ShowcaseProductCard";

export function TopProducts({ sectionId = "top-products" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiRequest("/shop-products/public/top?limit=8", { cacheTtl: 60_000 })
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

  return (
    <section id={sectionId || undefined} className="site-section relative">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
              <Star className="h-3.5 w-3.5" />
              Hand-picked
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              Top <span className="text-gradient">Products</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Selected products from our shop and wiring accessories, ready to explore.
            </p>
          </div>
          <a href="/products" className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            Browse all products <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        {loading ? (
          <div className="showcase-products-grid" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <ShowcaseProductSkeleton key={`top-skeleton-${index}`} />
            ))}
          </div>
        ) : (
          <div className="showcase-products-grid">
            {items.map((product, index) => (
              <ShowcaseProductCard
                key={product._id || product.slug || index}
                product={product}
                eager={index < 2}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
