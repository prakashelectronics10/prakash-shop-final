import { useEffect, useRef, useState } from "react";

/**
 * Story/carousel-style progress pills:
 * inactive = short track, active = longer track that fills, then advances.
 */
export function ProgressSliderDots({
  count,
  activeIndex,
  onChange,
  intervalMs = 4500,
  autoPlay = true,
  className = "",
  ariaLabel = "Slide indicators",
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);
  const onChangeRef = useRef(onChange);
  const activeIndexRef = useRef(activeIndex);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduceMotion(Boolean(motion?.matches));
    updateMotion();
    motion?.addEventListener?.("change", updateMotion);

    const updateVisibility = () => setPageHidden(document.visibilityState !== "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      motion?.removeEventListener?.("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    setCycleKey((key) => key + 1);
  }, [activeIndex, intervalMs, autoPlay, reduceMotion]);

  useEffect(() => {
    if (!autoPlay || count < 2 || pageHidden || !reduceMotion) return undefined;

    const timer = window.setTimeout(() => {
      const next = (activeIndexRef.current + 1) % count;
      onChangeRef.current(next);
    }, intervalMs);

    return () => window.clearTimeout(timer);
  }, [activeIndex, autoPlay, count, cycleKey, intervalMs, pageHidden, reduceMotion]);

  if (count < 2) return null;

  const select = (index) => {
    if (index === activeIndex) {
      setCycleKey((key) => key + 1);
      return;
    }
    onChange(index);
  };

  const handleFillEnd = (event) => {
    const name = event.animationName || "";
    if (!String(name).includes("progressSliderDotFill")) return;
    if (!autoPlay || pageHidden || reduceMotion) return;
    const next = (activeIndexRef.current + 1) % count;
    onChangeRef.current(next);
  };

  return (
    <div
      className={`progress-slider-dots ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {Array.from({ length: count }, (_, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`Go to slide ${index + 1}`}
            className={`progress-slider-dot ${active ? "is-active" : ""}`}
            onClick={() => select(index)}
          >
            <span className="progress-slider-dot-track" aria-hidden="true">
              {active ? (
                <span
                  key={`${index}-${cycleKey}`}
                  className={`progress-slider-dot-fill ${reduceMotion ? "is-instant" : ""} ${pageHidden ? "is-paused" : ""}`}
                  style={{ "--progress-duration": `${intervalMs}ms` }}
                  onAnimationEnd={handleFillEnd}
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
