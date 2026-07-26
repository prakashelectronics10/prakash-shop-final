import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plug } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getIcon } from "./iconMap";
import { OptimizedImage } from "./OptimizedImage";
import { ProgressSliderDots } from "./ProgressSliderDots";

function firstMediaUrl(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
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

export const Carousel3D = memo(function Carousel3D({ sectionId = "featured-repairs" }) {
  const { products, content } = useSiteData();
  const section = content.featuredCarousel || {};
  const cards = useMemo(() => products.filter((product) => product.isFeatured).slice(0, 5), [products]);
  const [active, setActive] = useState(0);
  const [isCompact, setIsCompact] = useState(false);
  const pointerStartRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const total = cards.length;

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 640px)");
    if (!media) return undefined;
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const go = useCallback((dir) => {
    if (!total) return;
    setActive((a) => (a + dir + total) % total);
  }, [total]);

  const getRel = useCallback((i) => {
    if (!total) return 0;
    let d = i - active;
    if (d > total / 2) d -= total;
    if (d < -total / 2) d += total;
    return d;
  }, [active, total]);

  const handlePointerDown = useCallback((event, rel) => {
    if (rel !== 0) return;
    pointerStartRef.current = event.clientX;
  }, []);

  const handlePointerUp = useCallback((event) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (typeof start !== "number") return;
    const diff = event.clientX - start;
    if (diff < -60) go(1);
    if (diff > 60) go(-1);
  }, [go]);

  useEffect(() => {
    if (active >= total) {
      setActive(0);
    }
  }, [active, total]);

  if (!cards.length) return null;

  return (
    <section id={sectionId || undefined} className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
      </div>
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
        </div>

        <div className="relative mt-16 flex h-[min(440px,70vw)] min-h-[300px] items-center justify-center [perspective:1400px] sm:h-[440px]">
          {cards.map((card, i) => {
            const rel = getRel(i);
            const abs = Math.abs(rel);
            // Keep only nearest cards painted — cheaper on low-RAM phones.
            if (abs > (prefersReducedMotion ? 1 : 2)) return null;
            const x = rel * (isCompact ? 150 : 240);
            const rotateY = prefersReducedMotion ? 0 : rel * -18;
            const scale = 1 - abs * 0.12;
            const opacity = 1 - abs * 0.35;
            const z = -abs * 100;
            const Icon = getIcon(card.iconName, Plug);
            const mediaUrl = firstMediaUrl(
              card.iconImageUrl,
              card.iconImage?.url,
              card.iconImage,
              card.imageUrl,
              card.image?.url,
              card.image,
              card.photoUrl,
              card.url,
              card.src,
            );

            return (
              <div
                key={card._id || card.slug}
                style={{
                  zIndex: 10 - abs,
                  opacity,
                  transform: `translate3d(${x}px, 0, ${z}px) rotateY(${rotateY}deg) scale(${scale})`,
                  transition: prefersReducedMotion ? "none" : "transform 220ms ease-out, opacity 180ms ease-out",
                }}
                className="absolute w-[300px] sm:w-[340px] md:w-[380px] select-none"
                onPointerDown={(event) => handlePointerDown(event, rel)}
                onPointerUp={handlePointerUp}
                onClick={() => rel !== 0 && setActive(i)}
              >
                <div
                  className={`relative cursor-pointer overflow-hidden rounded-3xl border-glow p-6 sm:p-8 shadow-elegant bg-card/90 sm:bg-card/85 sm:backdrop-blur-xl select-none ${
                    rel === 0 ? "shadow-glow" : ""
                  }`}
                >
                  {!prefersReducedMotion && (
                    <div className="pointer-events-none absolute -right-16 -top-16 hidden h-48 w-48 rounded-full bg-gradient-primary opacity-25 blur-3xl sm:block" />
                  )}
                  <div className="relative flex flex-col items-start">
                    <div className="flex w-full items-center justify-between gap-3">
                      {mediaUrl ? (
                        <div className="featured-repair-thumb inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-glow">
                          <OptimizedImage
                            src={mediaUrl}
                            alt={card.title || "Featured repair"}
                            className="featured-repair-thumb-image"
                            loading={i === active ? "eager" : "lazy"}
                            width={128}
                            height={128}
                            sizes="64px"
                          />
                        </div>
                      ) : (
                        <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                          <Icon className="h-8 w-8 text-primary-foreground" />
                        </div>
                      )}
                      {card.badge && (
                        <span className="inline-flex rounded-full glass px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
                          {card.badge}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-6 font-display text-2xl font-bold text-foreground">{card.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {card.shortDescription || card.description}
                    </p>
                    <a
                      href="/booking"
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform duration-300 hover:scale-105"
                    >
                      Book this service
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <ProgressSliderDots
          count={total}
          activeIndex={active}
          onChange={setActive}
          intervalMs={5200}
          className="carousel-progress-dots"
          ariaLabel="Featured repair slides"
        />
      </div>
    </section>
  );
});
