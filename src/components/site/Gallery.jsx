import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Expand } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { Lightbox } from "./Lightbox";
import { OptimizedImage } from "./OptimizedImage";
import { normalizeGalleryItems } from "../../utils/gallery";

function GalleryMarqueeCard({ item, index, onOpen, eager = false }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Open ${item.label} in lightbox`}
      className="gallery-marquee-card gallery-tile group relative cursor-zoom-in overflow-hidden rounded-2xl border-glow shadow-card text-left"
    >
      <OptimizedImage
        src={item.src}
        alt={item.label}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        width={720}
        height={840}
        sizes="(min-width: 768px) 240px, 70vw"
        className="gallery-tile-image h-full w-full object-cover"
      />
      <div className="gallery-tile-expand absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
          <Expand className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>
    </button>
  );
}

function buildLoopItems(sourceItems, loopCopies, keyPrefix) {
  if (!sourceItems.length) return [];
  return Array.from({ length: loopCopies }, (_, copy) =>
    sourceItems.map(({ item, index }) => ({
      item,
      index,
      key: `${keyPrefix}-${copy}-${item.src}-${index}`,
    })),
  ).flat();
}

function GalleryMarqueeRow({
  loopItems,
  direction = "rtl",
  durationSec,
  loopCopies,
  forcePaused = false,
  onOpen,
  eagerCount = 0,
}) {
  const [paused, setPaused] = useState(false);
  const isPaused = forcePaused || paused;

  return (
    <div
      className={`gallery-marquee gallery-marquee--${direction}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
      style={{
        "--gallery-marquee-duration": `${durationSec}s`,
        "--gallery-loop-span": `-${100 / loopCopies}%`,
      }}
    >
      <div
        className={`gallery-marquee-track gallery-marquee-track--${direction}${isPaused ? " is-paused" : ""}`}
      >
        {loopItems.map(({ item, index, key }, loopIndex) => (
          <GalleryMarqueeCard
            key={key}
            item={item}
            index={index}
            onOpen={onOpen}
            eager={loopIndex < eagerCount}
          />
        ))}
      </div>
    </div>
  );
}

export function Gallery({ sectionId = "gallery" }) {
  const { content } = useSiteData();
  const section = content.gallery || {};
  const items = useMemo(() => normalizeGalleryItems(content.gallery), [content.gallery]);
  const [active, setActive] = useState(null);
  const [sectionInView, setSectionInView] = useState(true);
  const [pageHidden, setPageHidden] = useState(false);
  const sectionRef = useRef(null);

  const loopCopies = items.length > 0 && items.length < 5 ? 4 : 2;

  const sourceItems = useMemo(
    () => items.map((item, index) => ({ item, index })),
    [items],
  );

  const loopItems = useMemo(
    () => buildLoopItems(sourceItems, loopCopies, "row"),
    [sourceItems, loopCopies],
  );

  const durationSec = Math.max(24, items.length * 5);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        setSectionInView(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: "120px 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageHidden(document.visibilityState !== "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  if (!items.length) return null;

  const lightboxOpen = active !== null;
  const forcePaused = lightboxOpen || !sectionInView || pageHidden;

  return (
    <section
      id={sectionId || undefined}
      ref={sectionRef}
      className="site-section relative overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
          <a
            href="/gallery"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-foreground"
          >
            View full gallery <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="gallery-marquee-stack mt-10">
        <GalleryMarqueeRow
          loopItems={loopItems}
          direction="rtl"
          durationSec={durationSec}
          loopCopies={loopCopies}
          forcePaused={forcePaused}
          onOpen={setActive}
          eagerCount={2}
        />
      </div>

      <Lightbox
        items={items}
        index={active}
        onClose={() => setActive(null)}
        onIndexChange={setActive}
      />
    </section>
  );
}
