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
