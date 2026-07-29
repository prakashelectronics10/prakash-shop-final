import { useEffect, useMemo, useState } from "react";
import { PackageSearch } from "lucide-react";
import { apiRequest } from "../../api/client";
import { getProductSharePath } from "../../utils/productShare";
import { getRelatedProducts } from "../../utils/productSearch";
import { OptimizedImage } from "./OptimizedImage";
import { ProductPriceDisplay } from "./ProductPriceDisplay";

function RelatedProductCard({ product }) {
  const href = getProductSharePath(product);
  const name = product.name || "Product";

  return (
    <a href={href} className="related-product-card" aria-label={`Open ${name} details`}>
      <div className="related-product-media">
        {product.imageUrl ? (
          <OptimizedImage
            src={product.imageUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            width={320}
            height={320}
            sizes="(min-width: 768px) 22vw, 46vw"
            className="related-product-image"
          />
        ) : (
          <div className="related-product-fallback">
            <PackageSearch className="h-7 w-7" />
          </div>
        )}
      </div>
      <div className="related-product-body">
        <span className="related-product-category">{product.category || product.originalCategory || "Product"}</span>
        <h3>{name}</h3>
        <ProductPriceDisplay product={product} size="card" />
      </div>
    </a>
  );
}

/**
 * Shows products related by category and/or shared tags under a detail page.
 * @param {{ product: object, sourceType?: "shop" | "project-part", limit?: number }} props
 */
export function RelatedProductsSection({ product, sourceType = "shop", limit = 8 }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!product) return undefined;
    let mounted = true;

    async function loadCatalog() {
      setLoading(true);
      try {
        const endpoint = sourceType === "project-part"
          ? "/project-parts/public/parts?limit=120"
          : "/shop-products/public/products?limit=150";
        const response = await apiRequest(endpoint, { cacheTtl: 5 * 60 * 1000 });
        if (!mounted) return;
        setCatalog(Array.isArray(response?.data?.items) ? response.data.items : []);
      } catch (_error) {
        if (mounted) setCatalog([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCatalog();
    return () => {
      mounted = false;
    };
  }, [product, sourceType]);

  const related = useMemo(
    () => getRelatedProducts(product, catalog, { limit }),
    [catalog, limit, product],
  );

  if (!product || (!loading && !related.length)) return null;

  return (
    <section className="related-products-section" aria-label="Related products">
      <div className="related-products-header">
        <h2>Related products</h2>
        <p>More items from the same category and tags.</p>
      </div>

      {loading ? (
        <div className="related-products-grid" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`related-skeleton-${index}`} className="related-product-skeleton" />
          ))}
        </div>
      ) : (
        <div className="related-products-grid">
          {related.map((item) => (
            <RelatedProductCard key={item._id || item.slug || item.name} product={item} />
          ))}
        </div>
      )}
    </section>
  );
}
