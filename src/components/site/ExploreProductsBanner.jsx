import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { useSwipeNavigation } from "../../hooks/useSwipeNavigation";
import exploreGalleryImage from "../../assets/ExploreGallery.png";
import bookRepairImage from "../../assets/bookrepair.png";
import exploreProductsImage from "../../assets/ExploreProducts.png";
import exploreWiringImage from "../../assets/ExploreWiring.png";
import pulseAiImage from "../../assets/pulseAi.png";

const SLIDE_INTERVAL_MS = 2500;
const SLIDE_TRANSITION_MS = 560;

const SLIDES = [
  {
    id: "gallery",
    image: exploreGalleryImage,
    alt: "Explore the Prakash Electronics photo gallery",
    href: "/gallery",
    button: "View Gallery",
  },
  {
    id: "repair",
    image: bookRepairImage,
    alt: "Book appliance repair with Prakash Electronics",
    href: "/booking",
    button: "Book a Repair",
  },
  {
    id: "products",
    image: exploreProductsImage,
    alt: "Browse electronics products at Prakash Electronics",
    href: "/products",
    button: "Explore Products",
  },
  {
    id: "wiring",
    image: exploreWiringImage,
    alt: "Shop wiring accessories at Prakash Electronics",
    href: CANONICAL_WIRING_PARTS_PATH,
    button: "Browse Accessories",
  },
  {
    id: "pulse",
    image: pulseAiImage,
    alt: "Chat with Pulse AI at Prakash Electronics",
    href: "/pulse-ai",
    button: "Chat with AI",
  },
];

export function ExploreProductsBanner() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sectionRef = useRef(null);
  const total = SLIDES.length;

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.25 },
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
    if (paused || !inView || reduceMotion || total < 2) return undefined;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setActiveIndex((current) => (current + 1) % total);
    };

    const timer = window.setInterval(tick, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, inView, reduceMotion, total, activeIndex]);

  const goRelative = useCallback((dir) => {
    setActiveIndex((current) => (current + dir + total) % total);
  }, [total]);

  const goTo = useCallback((index) => {
    setActiveIndex(((index % total) + total) % total);
  }, [total]);

  const swipe = useSwipeNavigation({
    enabled: total > 1,
    onSwipeLeft: () => goRelative(1),
    onSwipeRight: () => goRelative(-1),
  });

  return (
    <section
      ref={sectionRef}
      className="site-section explore-products-banner"
      aria-label="Explore Prakash Electronics"
      aria-roledescription="carousel"
    >
      <div
        className="explore-products-banner__viewport"
        style={swipe.style}
        onPointerDown={swipe.onPointerDown}
        onPointerUp={swipe.onPointerUp}
        onPointerCancel={swipe.onPointerCancel}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
        }}
      >
        <div
          className="explore-products-banner__track"
          style={{
            transform: `translate3d(-${activeIndex * 100}%, 0, 0)`,
            transitionDuration: reduceMotion ? "0ms" : `${SLIDE_TRANSITION_MS}ms`,
          }}
        >
          {SLIDES.map((slide, index) => (
            <div
              className="explore-products-banner__slide"
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${total}`}
              aria-hidden={index !== activeIndex}
            >
              <div className="explore-products-banner__inner">
                <div className="explore-products-banner__visual">
                  <span className="explore-products-banner__glow" aria-hidden="true" />
                  <img
                    className="explore-products-banner__image"
                    src={slide.image}
                    alt={slide.alt}
                    width={720}
                    height={560}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                  />
                </div>

                <a
                  className="explore-products-banner__button"
                  href={slide.href}
                  tabIndex={index === activeIndex ? 0 : -1}
                >
                  {slide.button}
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="explore-products-banner__dots" role="tablist" aria-label="Slide controls">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            className={`explore-products-banner__dot${index === activeIndex ? " is-active" : ""}`}
            aria-label={`Show ${slide.button}`}
            aria-selected={index === activeIndex}
            onClick={() => goTo(index)}
          />
        ))}
      </div>
    </section>
  );
}
