import { Children, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./SnapCarousel.css";

/**
 * Flat, native scroll-snap carousel — finger swipe on mobile, arrows on desktop.
 * No 3D transforms or JS animation loops.
 */
export function SnapCarousel({
  children,
  className = "",
  ariaLabel = "Carousel",
  showArrows = true,
  activeIndex: controlledIndex,
  onActiveIndexChange,
  slideClassName = "",
}) {
  const trackRef = useRef(null);
  const slides = Children.toArray(children).filter(Boolean);
  const total = slides.length;
  const canNavigate = total > 1;
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = typeof controlledIndex === "number" ? controlledIndex : internalIndex;
  const scrollingProgrammaticallyRef = useRef(false);
  const lastReportedRef = useRef(activeIndex);
  const didCenterRef = useRef(false);
  const scrollRafRef = useRef(0);

  const setActive = useCallback(
    (index) => {
      const next = ((index % total) + total) % total;
      if (next === lastReportedRef.current) return;
      lastReportedRef.current = next;
      if (typeof controlledIndex !== "number") setInternalIndex(next);
      onActiveIndexChange?.(next);
    },
    [controlledIndex, onActiveIndexChange, total],
  );

  const scrollToIndex = useCallback(
    (index, behavior = "smooth") => {
      const track = trackRef.current;
      if (!track || !total) return;
      const slide = track.children[index];
      if (!slide) return;
      scrollingProgrammaticallyRef.current = true;
      // Scroll the track only (not the page) so finger swipe stays smooth.
      const target = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
      track.scrollTo({
        left: Math.max(0, target),
        behavior: behavior === "smooth" ? "smooth" : "auto",
      });
      window.setTimeout(() => {
        scrollingProgrammaticallyRef.current = false;
      }, behavior === "smooth" ? 450 : 50);
    },
    [total],
  );

  const go = useCallback(
    (dir) => {
      if (!canNavigate) return;
      const next = activeIndex + dir;
      if (next < 0 || next >= total) return;
      lastReportedRef.current = next;
      if (typeof controlledIndex !== "number") setInternalIndex(next);
      onActiveIndexChange?.(next);
      scrollToIndex(next);
    },
    [activeIndex, canNavigate, controlledIndex, onActiveIndexChange, scrollToIndex, total],
  );

  useEffect(() => {
    if (!total) return;
    const index = typeof controlledIndex === "number" ? controlledIndex : 0;
    if (!didCenterRef.current) {
      didCenterRef.current = true;
      lastReportedRef.current = index;
      window.requestAnimationFrame(() => scrollToIndex(index, "auto"));
      return;
    }
    if (typeof controlledIndex !== "number") return;
    if (controlledIndex === lastReportedRef.current) return;
    lastReportedRef.current = controlledIndex;
    scrollToIndex(controlledIndex);
  }, [controlledIndex, scrollToIndex, total]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !canNavigate) return undefined;

    const syncFromScroll = () => {
      if (scrollingProgrammaticallyRef.current) return;
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(track.children).forEach((child, index) => {
        const mid = child.offsetLeft + child.clientWidth / 2;
        const dist = Math.abs(mid - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
      });
      setActive(best);
    };

    const onScroll = () => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        syncFromScroll();
      });
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, [canNavigate, setActive]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!canNavigate) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      }
    },
    [canNavigate, go],
  );

  if (!total) return null;

  const showPrev = showArrows && canNavigate && activeIndex > 0;
  const showNext = showArrows && canNavigate && activeIndex < total - 1;

  return (
    <div
      className={`snap-carousel ${className}`.trim()}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {showArrows && canNavigate ? (
        <button
          type="button"
          className={`snap-carousel-nav snap-carousel-nav-prev${showPrev ? "" : " is-hidden"}`}
          onClick={() => go(-1)}
          aria-label="Previous slide"
          aria-hidden={!showPrev}
          tabIndex={showPrev ? 0 : -1}
          disabled={!showPrev}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
      ) : null}

      <div className="snap-carousel-viewport">
        <div
          ref={trackRef}
          className="snap-carousel-track"
          onDragStart={(event) => event.preventDefault()}
        >
          {slides.map((child, index) => (
            <div
              key={child.key || index}
              className={`snap-carousel-slide${index === activeIndex ? " is-active" : ""}${slideClassName ? ` ${slideClassName}` : ""}`}
              aria-hidden={index === activeIndex ? undefined : true}
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {showArrows && canNavigate ? (
        <button
          type="button"
          className={`snap-carousel-nav snap-carousel-nav-next${showNext ? "" : " is-hidden"}`}
          onClick={() => go(1)}
          aria-label="Next slide"
          aria-hidden={!showNext}
          tabIndex={showNext ? 0 : -1}
          disabled={!showNext}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
        </button>
      ) : null}
    </div>
  );
}

export default SnapCarousel;
