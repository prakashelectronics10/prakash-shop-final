import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BadgePercent, CalendarClock, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { OptimizedImage } from "./OptimizedImage";

function offerDateLabel(offer = {}) {
  const value = offer.endsAt || offer.startsAt || offer.updatedAt;
  if (!value) return "Latest update";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(value));
  } catch (_error) {
    return "Latest update";
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return undefined;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

function useCarouselMetrics() {
  const [metrics, setMetrics] = useState({ spacing: 188, rotate: 14, scaleStep: 0.13 });

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth || 1200;
      if (width <= 480) {
        setMetrics({ spacing: 132, rotate: 10, scaleStep: 0.1 });
      } else if (width <= 768) {
        setMetrics({ spacing: 150, rotate: 12, scaleStep: 0.11 });
      } else {
        setMetrics({ spacing: 188, rotate: 14, scaleStep: 0.13 });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return metrics;
}

function OfferCard({ offer, eager }) {
  return (
    <article className="offer-card">
      <div className="offer-card-media">
        {offer.imageUrl ? (
          <OptimizedImage
            src={offer.imageUrl}
            alt={offer.title}
            className="offer-card-image"
            loading={eager ? "eager" : "lazy"}
            width={720}
            height={405}
            sizes="(min-width: 1024px) 340px, (min-width: 640px) 300px, 86vw"
          />
        ) : (
          <div className="offer-card-image-fallback">
            <BadgePercent className="h-9 w-9" />
            <span>{offer.title || "Offer"}</span>
          </div>
        )}
        <div className="offer-card-media-shade" />
        <div className="offer-card-status">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Recent</span>
        </div>
      </div>
      <div className="offer-card-body">
        <div className="offer-card-meta-row">
          <span className="offer-card-date">
            <CalendarClock className="h-3.5 w-3.5" />
            {offerDateLabel(offer)}
          </span>
          {offer.code ? <span className="offer-card-code">{offer.code}</span> : null}
        </div>
        <h3 className="offer-card-title font-display">{offer.title}</h3>
        <p className="offer-card-description text-muted-foreground">{offer.description}</p>
        <div className="offer-card-action">
          <a
            href={offer.ctaHref || "/booking"}
            className="offer-card-button"
            tabIndex={eager ? 0 : -1}
            aria-hidden={eager ? undefined : true}
          >
            <span>{offer.ctaLabel || "Book now"}</span>
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function Offers({ sectionId = "offers" }) {
  const { offers } = useSiteData();
  const activeOffers = offers.filter((offer) => offer.isActive !== false);
  const [active, setActive] = useState(0);
  const pointerStartRef = useRef(null);
  const lastGestureAtRef = useRef(0);
  const didSwipeRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { spacing, rotate, scaleStep } = useCarouselMetrics();
  const total = activeOffers.length;
  const canNavigate = total > 1;

  const go = useCallback((dir) => {
    if (!total) return;
    setActive((current) => (current + dir + total) % total);
  }, [total]);

  const getRel = useCallback((index) => {
    if (!total) return 0;
    let delta = index - active;
    if (delta > total / 2) delta -= total;
    if (delta < -total / 2) delta += total;
    return delta;
  }, [active, total]);

  const handlePointerDown = useCallback((event) => {
    if (!canNavigate) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    didSwipeRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }, [canNavigate]);

  const handlePointerUp = useCallback((event) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || !canNavigate) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    const now = Date.now();
    if (now - lastGestureAtRef.current < 320) return;
    lastGestureAtRef.current = now;
    didSwipeRef.current = true;
    go(deltaX < 0 ? 1 : -1);
  }, [canNavigate, go]);

  useEffect(() => {
    if (active >= total) setActive(0);
  }, [active, total]);

  const handleKeyDown = useCallback((event) => {
    if (!canNavigate) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  }, [canNavigate, go]);

  const selectSlide = useCallback((index) => {
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }
    setActive(index);
  }, []);

  if (!activeOffers.length) return null;

  return (
    <section id={sectionId || undefined} className="relative py-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
              Recent updates
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              Recent <span className="text-gradient">Products</span> or <span className="text-gradient">Repairing</span>
            </h2>
          </div>
          <a href="/booking" className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            Book services now <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div
          className="offers-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="Recent products and repairing updates"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {canNavigate ? (
            <button
              type="button"
              className="offers-carousel-nav offers-carousel-nav-prev"
              onClick={() => go(-1)}
              aria-label="Previous offer"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
            </button>
          ) : null}

          <div
            className="offers-carousel-stage"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => { pointerStartRef.current = null; }}
          >
            {activeOffers.map((offer, index) => {
              const rel = getRel(index);
              const abs = Math.abs(rel);
              if (abs > (prefersReducedMotion ? 1 : 2)) return null;

              const x = rel * spacing;
              const rotateY = prefersReducedMotion ? 0 : rel * -rotate;
              const scale = 1 - abs * scaleStep;
              const opacity = 1 - abs * 0.26;
              const z = prefersReducedMotion ? 0 : -abs * 110;
              const isActive = rel === 0;

              return (
                <div
                  key={offer._id || offer.title || index}
                  className={`offers-carousel-slide${isActive ? " is-active" : ""}`}
                  style={{
                    zIndex: 20 - abs,
                    opacity,
                    transform: `translate3d(${x}px, 0, ${z}px) rotateY(${rotateY}deg) scale(${scale})`,
                    transition: prefersReducedMotion
                      ? "none"
                      : "transform 280ms ease-out, opacity 220ms ease",
                  }}
                  onClick={() => {
                    if (!isActive) selectSlide(index);
                  }}
                  onKeyDown={(event) => {
                    if (isActive) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActive(index);
                    }
                  }}
                  role={isActive ? "group" : "button"}
                  tabIndex={isActive ? -1 : 0}
                  aria-label={isActive ? undefined : `Show ${offer.title || "offer"}`}
                  aria-hidden={abs > 1 ? true : undefined}
                >
                  <OfferCard offer={offer} eager={isActive} />
                </div>
              );
            })}
          </div>

          {canNavigate ? (
            <button
              type="button"
              className="offers-carousel-nav offers-carousel-nav-next"
              onClick={() => go(1)}
              aria-label="Next offer"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
