import { memo } from "react";
import { PackageSearch } from "lucide-react";
import { getProductSharePath } from "../../utils/productShare";
import { OptimizedImage } from "./OptimizedImage";
import { ProductPriceDisplay } from "./ProductPriceDisplay";

/**
 * Homepage showcase card: image + name + selling price + ↓% discount.
 * Used by Trending Products and Top Products.
 */
export const ShowcaseProductCard = memo(function ShowcaseProductCard({
  product,
  rank = null,
  eager = false,
  className = "",
}) {
  const href = getProductSharePath(product);
  const name = product.name || "Product";

  return (
    <a
      href={href}
      className={`showcase-product-card group ${className}`.trim()}
      aria-label={`Open ${name} product details`}
    >
      <div className="showcase-product-media">
        {product.imageUrl ? (
          <OptimizedImage
            src={product.imageUrl}
            alt={name}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={eager ? "high" : "low"}
            width={640}
            height={640}
            sizes="(min-width: 1024px) 160px, (min-width: 768px) 30vw, 46vw"
            className="showcase-product-image"
          />
        ) : (
          <div className="showcase-product-fallback" aria-hidden="true">
            <PackageSearch className="h-8 w-8" />
          </div>
        )}
        {rank != null ? (
          <span className="showcase-product-rank">#{rank}</span>
        ) : null}
      </div>

      <div className="showcase-product-body">
        <h3 className="showcase-product-name">{name}</h3>
        <ProductPriceDisplay
          product={product}
          showDiscountBadge
          size="card"
          className="showcase-product-price"
        />
      </div>
    </a>
  );
});

export function ShowcaseProductSkeleton() {
  return <div className="showcase-product-skeleton" aria-hidden="true" />;
}
