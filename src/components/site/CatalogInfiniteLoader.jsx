import { useEffect, useRef } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

export function CatalogInfiniteLoader({
  hasMore,
  loading,
  error = "",
  loadedCount = 0,
  total = 0,
  onLoadMore,
  onRetry,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || error || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        onLoadMore();
      },
      { rootMargin: "700px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, hasMore, loading, onLoadMore]);

  return (
    <div className="catalog-infinite-loader" ref={sentinelRef} aria-live="polite">
      {loading ? (
        <span><LoaderCircle className="catalog-loader-icon" size={18} /> Loading more products...</span>
      ) : error ? (
        <>
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            <RefreshCw size={16} /> Retry
          </button>
        </>
      ) : hasMore ? (
        <button type="button" onClick={onLoadMore}>Load more products</button>
      ) : loadedCount > 0 ? (
        <span>All {total || loadedCount} {(total || loadedCount) === 1 ? "product" : "products"} loaded</span>
      ) : null}
    </div>
  );
}
