import { Children, cloneElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./SnapCarousel.css";

/**
 * Flat, native scroll-snap carousel — finger swipe on mobile, arrows on desktop.
 * Optional infinite loop via cloned slide sets (no animation timers).
 */
export function SnapCarousel({
  children,
  className = "",
  ariaLabel = "Carousel",
  showArrows = true,
  activeIndex: controlledIndex,
  onActiveIndexChange,
  slideClassName = "",
  loop = false,
}) {
  const trackRef = useRef(null);
  const slides = useMemo(() => Children.toArray(children).filter(Boolean), [children]);
  const total = slides.length;
  const canNavigate = total > 1;
  const canLoop = loop && canNavigate;
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = typeof controlledIndex === "number" ? controlledIndex : internalIndex;
  const scrollingProgrammaticallyRef = useRef(false);
  const lastReportedRef = useRef(activeIndex);
  const didCenterRef = useRef(false);
  const scrollRafRef = useRef(0);
  const unlockTimeoutRef = useRef(0);
  const settleTimeoutRef = useRef(0);

  // Three copies so swipe can wrap seamlessly: [A][B][C]
  const trackSlides = useMemo(() => {
    if (!canLoop) {
      return slides.map((child, index) => ({
        child,
        logicalIndex: index,
        key: `s-${child.key ?? index}`,
        copy: 0,
      }));
    }
    const copies = [];
    for (let copy = 0; copy < 3; copy += 1) {
      slides.forEach((child, index) => {
        copies.push({
          child: cloneElement(child),
          logicalIndex: index,
          key: `c${copy}-${child.key ?? index}`,
          copy,
        });
      });
    }
    return copies;
  }, [canLoop, slides]);

  const toTrackIndex = useCallback(
    (logicalIndex) => {
      const safe = ((logicalIndex % total) + total) % total;
      return canLoop ? total + safe : safe;
    },
    [canLoop, total],
  );

  const setActive = useCallback(
    (logicalIndex) => {
      if (!total) return;
      const next = ((logicalIndex % total) + total) % total;
      if (next === lastReportedRef.current) return;
      lastReportedRef.current = next;
      if (typeof controlledIndex !== "number") setInternalIndex(next);
      onActiveIndexChange?.(next);
    },
    [controlledIndex, onActiveIndexChange, total],
  );

  const getCenteredLeft = useCallback((track, slide) => {
    return slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
  }, []);

  const lockProgrammaticScroll = useCallback((ms) => {
    scrollingProgrammaticallyRef.current = true;
    window.clearTimeout(unlockTimeoutRef.current);
    unlockTimeoutRef.current = window.setTimeout(() => {
      scrollingProgrammaticallyRef.current = false;
    }, ms);
  }, []);

  const scrollToTrackIndex = useCallback(
    (trackIndex, behavior = "smooth") => {
      const track = trackRef.current;
      if (!track || !total) return;
      const slide = track.children[trackIndex];
      if (!slide) return;
      lockProgrammaticScroll(behavior === "smooth" ? 450 : 50);
      track.scrollTo({
        left: Math.max(0, getCenteredLeft(track, slide)),
        behavior: behavior === "smooth" ? "smooth" : "auto",
      });
    },
    [getCenteredLeft, lockProgrammaticScroll, total],
  );

  const jumpToTrackIndex = useCallback(
    (trackIndex) => {
      const track = trackRef.current;
      if (!track || !total) return;
      const slide = track.children[trackIndex];
      if (!slide) return;
      lockProgrammaticScroll(60);
      const previousSnap = track.style.scrollSnapType;
      track.style.scrollSnapType = "none";
      track.scrollTo({ left: Math.max(0, getCenteredLeft(track, slide)), behavior: "auto" });
      void track.scrollLeft;
      track.style.scrollSnapType = previousSnap || "";
    },
    [getCenteredLeft, lockProgrammaticScroll, total],
  );

  const go = useCallback(
    (dir) => {
      if (!canNavigate) return;
      const next = canLoop
        ? (((activeIndex + dir) % total) + total) % total
        : Math.min(Math.max(activeIndex + dir, 0), total - 1);
      if (!canLoop && next === activeIndex) return;

      lastReportedRef.current = next;
      if (typeof controlledIndex !== "number") setInternalIndex(next);
      onActiveIndexChange?.(next);

      if (!canLoop) {
        scrollToTrackIndex(next);
        return;
      }

      // Scroll to the adjacent slide in the current middle set (or into a clone),
      // then scroll-end normalization snaps back into the middle copy.
      scrollToTrackIndex(toTrackIndex(activeIndex) + dir);
    },
    [
      activeIndex,
      canLoop,
      canNavigate,
      controlledIndex,
      onActiveIndexChange,
      scrollToTrackIndex,
      toTrackIndex,
      total,
    ],
  );

  useEffect(() => {
    didCenterRef.current = false;
  }, [total, canLoop]);

  useEffect(() => {
    if (!total) return;
    const index = typeof controlledIndex === "number" ? controlledIndex : 0;
    if (!didCenterRef.current) {
      didCenterRef.current = true;
      lastReportedRef.current = index;
      window.requestAnimationFrame(() => scrollToTrackIndex(toTrackIndex(index), "auto"));
      return;
    }
    if (typeof controlledIndex !== "number") return;
    if (controlledIndex === lastReportedRef.current) return;
    lastReportedRef.current = controlledIndex;
    scrollToTrackIndex(toTrackIndex(controlledIndex));
  }, [canLoop, controlledIndex, scrollToTrackIndex, toTrackIndex, total]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !canNavigate) return undefined;

    const nearestTrackIndex = () => {
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
      return best;
    };

    const normalizeLoopPosition = (trackIndex) => {
      if (!canLoop) return trackIndex;
      if (trackIndex < total || trackIndex >= total * 2) {
        const logical = ((trackIndex % total) + total) % total;
        jumpToTrackIndex(total + logical);
        return total + logical;
      }
      return trackIndex;
    };

    const syncFromScroll = () => {
      if (scrollingProgrammaticallyRef.current) return;
      const trackIndex = nearestTrackIndex();
      const logical = canLoop ? ((trackIndex % total) + total) % total : trackIndex;
      setActive(logical);
    };

    const finishScroll = () => {
      if (scrollingProgrammaticallyRef.current) {
        // Arrow/programmatic smooth scroll just finished — still normalize clones.
        if (canLoop) {
          const trackIndex = nearestTrackIndex();
          if (trackIndex < total || trackIndex >= total * 2) {
            const logical = ((trackIndex % total) + total) % total;
            jumpToTrackIndex(total + logical);
            setActive(logical);
          }
        }
        return;
      }
      const trackIndex = normalizeLoopPosition(nearestTrackIndex());
      const logical = canLoop ? ((trackIndex % total) + total) % total : trackIndex;
      setActive(logical);
    };

    const onScroll = () => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        syncFromScroll();
      });
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = window.setTimeout(finishScroll, 140);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("scrollend", finishScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", finishScroll);
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
      window.clearTimeout(unlockTimeoutRef.current);
      window.clearTimeout(settleTimeoutRef.current);
    };
  }, [canLoop, canNavigate, jumpToTrackIndex, setActive, total]);

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

  const showPrev = showArrows && canNavigate && (canLoop || activeIndex > 0);
  const showNext = showArrows && canNavigate && (canLoop || activeIndex < total - 1);

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
          {trackSlides.map(({ child, logicalIndex, key, copy }) => {
            const isPrimaryActive = logicalIndex === activeIndex && (!canLoop || copy === 1);
            return (
              <div
                key={key}
                className={`snap-carousel-slide${logicalIndex === activeIndex ? " is-active" : ""}${slideClassName ? ` ${slideClassName}` : ""}`}
                aria-hidden={isPrimaryActive ? undefined : true}
              >
                {child}
              </div>
            );
          })}
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
