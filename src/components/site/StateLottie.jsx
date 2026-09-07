import { useEffect, useState } from "react";
import { LottieSvgAnimation } from "./LottieSvgAnimation";

const LOADING_SRC = "/loading.json";
const BLANK_SRC = "/blank.json";

const animationCache = new Map();
const inflight = new Map();

function loadLottieJson(src) {
  if (animationCache.has(src)) return Promise.resolve(animationCache.get(src));
  if (inflight.has(src)) return inflight.get(src);

  const request = fetch(src, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${src}`);
      return response.json();
    })
    .then((data) => {
      animationCache.set(src, data);
      inflight.delete(src);
      return data;
    })
    .catch((error) => {
      inflight.delete(src);
      throw error;
    });

  inflight.set(src, request);
  return request;
}

function useLottieSrc(src) {
  const [data, setData] = useState(() => animationCache.get(src) || null);

  useEffect(() => {
    let mounted = true;
    if (animationCache.has(src)) {
      setData(animationCache.get(src));
      return undefined;
    }

    loadLottieJson(src)
      .then((json) => {
        if (mounted) setData(json);
      })
      .catch(() => {
        if (mounted) setData(null);
      });

    return () => {
      mounted = false;
    };
  }, [src]);

  return data;
}

function StateLottieShell({ variant, src, title, message, className = "" }) {
  const data = useLottieSrc(src);

  return (
    <div
      className={`site-state-lottie site-state-lottie--${variant} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy={variant === "loading"}
    >
      <div className="site-state-lottie-frame">
        {data ? (
          <LottieSvgAnimation
            data={data}
            title={title}
            className="site-state-lottie-anim"
          />
        ) : (
          <div className="site-state-lottie-placeholder" aria-hidden="true" />
        )}
      </div>
      {message ? <p className="site-state-lottie-message">{message}</p> : null}
    </div>
  );
}

/** Compact loading animation for product grids, sections, and detail panels. */
export function LoadingState({ message = "Loading...", className = "" }) {
  return (
    <StateLottieShell
      variant="loading"
      src={LOADING_SRC}
      title="Loading"
      message={message}
      className={className}
    />
  );
}

/** Empty products animation — only for shop / project-parts product lists. */
export function EmptyProductsState({ message = "No products available.", className = "" }) {
  return (
    <StateLottieShell
      variant="empty"
      src={BLANK_SRC}
      title="No products"
      message={message}
      className={className}
    />
  );
}

/** Lightweight CSS skeleton for catalog grids — avoids Lottie on cold loads. */
export function CatalogGridSkeleton({ count = 6, className = "" }) {
  return (
    <div
      className={`parts-grid shop-products-grid catalog-grid-skeleton ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading products"
    >
      {Array.from({ length: count }, (_, index) => (
        <article key={`catalog-skeleton-${index}`} className="catalog-product-skeleton" aria-hidden="true">
          <div className="catalog-product-skeleton-media product-skeleton-shimmer" />
          <div className="catalog-product-skeleton-body">
            <span className="catalog-product-skeleton-line is-label product-skeleton-shimmer" />
            <span className="catalog-product-skeleton-line is-title product-skeleton-shimmer" />
            <span className="catalog-product-skeleton-line product-skeleton-shimmer" />
            <span className="catalog-product-skeleton-line is-short product-skeleton-shimmer" />
          </div>
          <div className="catalog-product-skeleton-foot">
            <span className="product-skeleton-shimmer" />
            <span className="product-skeleton-shimmer" />
          </div>
        </article>
      ))}
    </div>
  );
}
