import { useState } from "react";
import { Expand } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { Lightbox } from "./Lightbox";
import { OptimizedImage } from "./OptimizedImage";

export function Gallery({ sectionId = "gallery" }) {
  const { content } = useSiteData();
  const section = content.gallery || {};
  const items = (section.items || []).filter((item) => item.isActive !== false).map((item) => ({
    ...item,
    src: item.src || item.imageUrl || item.url,
    label: item.label || item.title || item.alt || "Gallery image",
    description: item.description || item.desc || "",
    size: item.size || item.imageSize || "square",
  }));
  const [active, setActive] = useState(null);

  if (!items.length) return null;

  return (
    <section id={sectionId || undefined} className="site-section relative">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
        </div>

        <div className="gallery-grid mt-12 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:auto-rows-[200px]">
          {items.map((it, i) => {
            const sizeClass = {
              portrait: "md:row-span-2",
              landscape: "md:col-span-2",
              wide: "md:col-span-2",
              tall: "md:row-span-2",
              banner: "md:col-span-4",
              square: "",
            }[it.size] || "";
            return (
            <button
              type="button"
              key={`${it.label}-${i}`}
              onClick={() => setActive(i)}
              aria-label={`Open ${it.label} in lightbox`}
              className={`gallery-tile group relative cursor-zoom-in overflow-hidden rounded-2xl border-glow shadow-card text-left md:glass ${it.span || sizeClass}`}
            >
              <OptimizedImage
                src={it.src}
                alt={it.label}
                loading="lazy"
                decoding="async"
                width={480}
                height={480}
                sizes="(min-width: 768px) 25vw, 50vw"
                className="gallery-tile-image h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent opacity-90" />
              <div className="gallery-tile-expand absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
                  <Expand className="h-5 w-5 text-primary-foreground" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1 text-xs font-medium md:glass-strong md:bg-transparent">
                {it.label}
              </div>
              {it.description ? (
                <div className="absolute bottom-12 left-3 right-3 hidden rounded-xl glass-strong px-3 py-2 text-xs text-muted-foreground md:block">
                  {it.description}
                </div>
              ) : null}
            </button>
          );})}
        </div>
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
