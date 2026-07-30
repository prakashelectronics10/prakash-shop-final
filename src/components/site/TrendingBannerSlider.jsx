import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSiteData } from "../../context/SiteDataContext";
import { useSwipeNavigation } from "../../hooks/useSwipeNavigation";
import { OptimizedImage } from "./OptimizedImage";

const SLIDE_INTERVAL_MS = 4500;

function normalizeBannerLink(link = "") {
  const value = String(link || "").trim();
  if (!value) return "";
  if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  if (value.startsWith("#")) return `/${value}`;
  return `/${value.replace(/^\//, "")}`;
}

export function TrendingBannerSlider() {
  const { trendingBanners = [] } = useSiteData();
  const items = useMemo(
    () => (Array.isArray(trendingBanners) ? trendingBanners : []).filter((banner) => banner?.imageUrl),
    [trendingBanners],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sectionRef = useRef(null);
  const pointerGuardRef = useRef({ x: 0, y: 0, moved: false });
  const canSlide = items.length > 1;

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduceMotion(Boolean(motion?.matches));
    updateMotion();
    motion?.addEventListener?.("change", updateMotion);
    return () => motion?.removeEventListener?.("change", updateMotion);
  }, []);

  useEffect(() => {
    if (!canSlide || paused || !inView || reduceMotion) return undefined;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setActiveIndex((current) => (current + 1) % items.length);
    };

    const timer = window.setInterval(tick, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canSlide, paused, inView, reduceMotion, items.length]);

  const goRelative = useCallback((dir) => {
    setActiveIndex((current) => {
      const total = items.length || 1;
      return (current + dir + total) % total;
    });
  }, [items.length]);

  const swipe = useSwipeNavigation({
    enabled: canSlide,
    onSwipeLeft: () => goRelative(1),
    onSwipeRight: () => goRelative(-1),
  });

  const handlePointerDown = useCallback((event) => {
    pointerGuardRef.current = { x: event.clientX, y: event.clientY, moved: false };
    swipe.onPointerDown?.(event);
  }, [swipe]);

  const handlePointerMove = useCallback((event) => {
    const start = pointerGuardRef.current;
    if (!start || start.moved) return;
    if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
      pointerGuardRef.current = { ...start, moved: true };
    }
  }, []);

  const handleLinkClick = useCallback((event) => {
    if (pointerGuardRef.current.moved) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  if (!items.length) return null;

  return (
    <section
      ref={sectionRef}
      className="trending-promo-banner site-section relative"
      aria-label="Promotional banner"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div
          className="trending-promo-banner__frame"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={swipe.onPointerUp}
          onPointerCancel={swipe.onPointerCancel}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={swipe.style}
        >
          <div
            className="trending-promo-banner__track"
            style={{ transform: `translateX(-${Math.min(activeIndex, items.length - 1) * 100}%)` }}
          >
            {items.map((banner, index) => {
              const link = normalizeBannerLink(banner.link);
              const near = !canSlide || Math.abs(index - activeIndex) <= 1
                || (activeIndex === 0 && index === items.length - 1)
                || (activeIndex === items.length - 1 && index === 0);
              const content = near ? (
                <OptimizedImage
                  src={banner.imageUrl}
                  alt={banner.alt || banner.title || "Promotional banner"}
                  width={880}
                  height={196}
                  sizes="(min-width: 1280px) 1280px, 100vw"
                  className="trending-promo-banner__image"
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  crop
                />
              ) : (
                <div className="trending-promo-banner__image" aria-hidden="true" />
              );

              return (
                <article
                  key={banner.id || `${banner.imageUrl}-${index}`}
                  className="trending-promo-banner__slide"
                  aria-hidden={index !== activeIndex}
                >
                  {link ? (
                    <a
                      href={link}
                      className="trending-promo-banner__link"
                      aria-label={banner.title ? `Open ${banner.title}` : "Open banner link"}
                      onClick={handleLinkClick}
                      tabIndex={index === activeIndex ? 0 : -1}
                    >
                      {content}
                    </a>
                  ) : content}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
