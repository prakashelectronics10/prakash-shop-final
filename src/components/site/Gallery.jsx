import { useMemo, useState } from "react";
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
        width={360}
        height={420}
        sizes="(min-width: 768px) 240px, 70vw"
        className="gallery-tile-image h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent opacity-90" />
      <div className="gallery-tile-expand absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
          <Expand className="h-5 w-5 text-primary-foreground" />
        </div>
      </div>
      <div className="absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1 text-xs font-medium md:glass-strong md:bg-transparent">
        {item.label}
      </div>
    </button>
  );
}

export function Gallery({ sectionId = "gallery" }) {
  const { content } = useSiteData();
  const section = content.gallery || {};
  const items = useMemo(() => normalizeGalleryItems(content.gallery), [content.gallery]);
  const [active, setActive] = useState(null);
  const [paused, setPaused] = useState(false);

  const loopCopies = items.length > 0 && items.length < 5 ? 4 : 2;
  const loopItems = useMemo(() => {
    if (!items.length) return [];
    return Array.from({ length: loopCopies }, (_, copy) =>
      items.map((item, index) => ({ item, index, key: `g${copy}-${item.src}-${index}` })),
    ).flat();
  }, [items, loopCopies]);

  const durationSec = Math.max(24, items.length * 5);

  if (!items.length) return null;

  const pause = () => setPaused(true);
  const resume = () => {
    if (active === null) setPaused(false);
  };

  return (
    <section id={sectionId || undefined} className="site-section relative overflow-hidden">
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

      <div
        className="gallery-marquee mt-10"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onPointerDown={pause}
        onPointerUp={resume}
        onPointerCancel={resume}
        style={{ "--gallery-marquee-duration": `${durationSec}s`, "--gallery-loop-span": `-${100 / loopCopies}%` }}
      >
        <div className={`gallery-marquee-track${paused || active !== null ? " is-paused" : ""}`}>
          {loopItems.map(({ item, index, key }, loopIndex) => (
            <GalleryMarqueeCard
              key={key}
              item={item}
              index={index}
              onOpen={setActive}
              eager={loopIndex < 3}
            />
          ))}
        </div>
      </div>

      <Lightbox
        items={items}
        index={active}
        onClose={() => {
          setActive(null);
          setPaused(false);
        }}
        onIndexChange={setActive}
      />
    </section>
  );
}
