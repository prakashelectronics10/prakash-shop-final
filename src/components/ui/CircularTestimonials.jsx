import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OptimizedImage } from "../site/OptimizedImage";

function calculateGap(width) {
  const minWidth = 1024;
  const maxWidth = 1456;
  const minGap = 60;
  const maxGap = 86;
  if (width <= minWidth) return minGap;
  if (width >= maxWidth) return Math.max(minGap, maxGap + 0.06018 * (width - maxWidth));
  return minGap + (maxGap - minGap) * ((width - minWidth) / (maxWidth - minWidth));
}

export function CircularTestimonials({
  testimonials = [],
  autoplay = true,
  colors = {},
  fontSizes = {},
}) {
  const items = useMemo(
    () => testimonials.filter((item) => item?.src && (item?.name || item?.quote)),
    [testimonials],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isPaused, setIsPaused] = useState(false);
  const imageContainerRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setActiveIndex((current) => (items.length ? Math.min(current, items.length - 1) : 0));
  }, [items.length]);

  useEffect(() => {
    const element = imageContainerRef.current;
    if (!element) return undefined;
    const updateWidth = () => setContainerWidth(element.offsetWidth || 1200);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth, { passive: true });
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleNext = useCallback(() => {
    if (items.length < 2) return;
    setActiveIndex((current) => (current + 1) % items.length);
  }, [items.length]);

  const handlePrev = useCallback(() => {
    if (items.length < 2) return;
    setActiveIndex((current) => (current - 1 + items.length) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (!autoplay || reduceMotion || isPaused || items.length < 2) return undefined;
    const interval = window.setInterval(handleNext, 5000);
    return () => window.clearInterval(interval);
  }, [autoplay, handleNext, isPaused, items.length, reduceMotion]);

  const getImageStyle = (index) => {
    const gap = calculateGap(containerWidth);
    const maxStickUp = gap * 0.8;
    const isActive = index === activeIndex;
    const isLeft = (activeIndex - 1 + items.length) % items.length === index;
    const isRight = (activeIndex + 1) % items.length === index;

    if (isActive) {
      return { zIndex: 3, opacity: 1, pointerEvents: "auto", transform: "translateX(0) translateY(0) scale(1) rotateY(0deg)" };
    }
    if (isLeft) {
      return { zIndex: 2, opacity: 1, pointerEvents: "auto", transform: `translateX(-${gap}px) translateY(-${maxStickUp}px) scale(.85) rotateY(15deg)` };
    }
    if (isRight) {
      return { zIndex: 2, opacity: 1, pointerEvents: "auto", transform: `translateX(${gap}px) translateY(-${maxStickUp}px) scale(.85) rotateY(-15deg)` };
    }
    return { zIndex: 1, opacity: 0, pointerEvents: "none", transform: "translateX(0) translateY(-20px) scale(.78) rotateY(0deg)" };
  };

  if (!items.length) return null;
  const activeTestimonial = items[activeIndex];
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.3, ease: "easeInOut" };

  return (
    <div
      className="circular-testimonials"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") handlePrev();
        if (event.key === "ArrowRight") handleNext();
      }}
    >
      <div className="circular-testimonials-grid">
        <div className="circular-testimonials-images" ref={imageContainerRef} aria-live="off">
          {items.map((testimonial, index) => (
            <button
              type="button"
              className="circular-testimonial-image-shell"
              key={`${testimonial.src}-${index}`}
              style={getImageStyle(index)}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show ${testimonial.name || `story ${index + 1}`}`}
              aria-current={index === activeIndex ? "true" : undefined}
              tabIndex={index === activeIndex ? 0 : -1}
            >
              <OptimizedImage
                src={testimonial.src}
                alt={testimonial.name || "Prakash Electronics story"}
                width={768}
                height={768}
                sizes="384px"
                className="circular-testimonial-image"
                loading={index === 0 ? "eager" : "lazy"}
              />
            </button>
          ))}
        </div>

        <div className="circular-testimonials-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={transition}
            >
              <h3 style={{ color: colors.name || "#0f172a", fontSize: fontSizes.name || "1.5rem" }}>
                {activeTestimonial.name}
              </h3>
              <p className="circular-testimonial-designation" style={{ color: colors.designation || "#64748b", fontSize: fontSizes.designation || ".925rem" }}>
                {activeTestimonial.designation}
              </p>
              <p className="circular-testimonial-quote" style={{ color: colors.testimony || "#475569", fontSize: fontSizes.quote || "1.05rem" }}>
                {String(activeTestimonial.quote || "").split(/\s+/).filter(Boolean).map((word, index) => (
                  <motion.span
                    key={`${word}-${index}`}
                    initial={reduceMotion ? false : { filter: "blur(10px)", opacity: 0, y: 5 }}
                    animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: "easeInOut", delay: 0.025 * index }}
                  >
                    {word}&nbsp;
                  </motion.span>
                ))}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="circular-testimonials-controls">
            <button type="button" onClick={handlePrev} aria-label="Previous story" disabled={items.length < 2}>
              <ArrowLeft aria-hidden="true" />
            </button>
            <button type="button" onClick={handleNext} aria-label="Next story" disabled={items.length < 2}>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

