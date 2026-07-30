import { useMemo, useState } from "react";
import { ArrowLeft, Expand, Images } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { gallerySizeClass, normalizeGalleryItems } from "../../utils/gallery";
import { Footer } from "./Footer";
import { Lightbox } from "./Lightbox";
import { Navbar } from "./Navbar";
import { OptimizedImage } from "./OptimizedImage";

export function GalleryPage() {
  const { content } = useSiteData();
  const section = content.gallery || {};
  const items = useMemo(() => normalizeGalleryItems(content.gallery), [content.gallery]);
  const [active, setActive] = useState(null);

  return (
    <div className="App gallery-page">
      <Navbar />
      <main>
        <section className="gallery-page-hero">
          <a className="detail-back-link gallery-page-back" href="/#gallery">
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back to home</span>
          </a>

          <div className="gallery-page-intro">
            <p className="gallery-page-kicker">
              <Images size={15} aria-hidden="true" />
              {section.eyebrow || "Gallery"}
            </p>
            <h1 className="gallery-page-title">
              {section.title || "Our"}{" "}
              <span className="text-gradient">{section.highlight || "Gallery"}</span>
            </h1>
            <p className="gallery-page-subtitle">
              Browse workshop photos, repair work, and shop moments from Prakash Electronics — all in one place.
            </p>
          </div>
        </section>

        <section className="gallery-page-content">
          {!items.length ? (
            <div className="gallery-page-empty">
              <Images className="h-10 w-10 text-accent" aria-hidden="true" />
              <h2>No gallery images yet</h2>
              <p>New photos will appear here once they are published.</p>
            </div>
          ) : (
            <div className="gallery-grid grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:auto-rows-[200px]">
              {items.map((it, i) => {
                const sizeClass = gallerySizeClass(it.size);
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
                      loading={i < 4 ? "eager" : "lazy"}
                      decoding="async"
                      width={480}
                      height={480}
                      crop
                      sizes="(min-width: 768px) 25vw, 50vw"
                      className="gallery-tile-image h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent opacity-90" />
                    <div className="gallery-tile-expand absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
                        <Expand className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>
                    <div className="absolute bottom-3 left-3 max-w-[85%] truncate rounded-full bg-background/85 px-3 py-1 text-xs font-medium md:glass-strong md:bg-transparent">
                      {it.label}
                    </div>
                    {it.description ? (
                      <div className="absolute bottom-12 left-3 right-3 hidden rounded-xl glass-strong px-3 py-2 text-xs text-muted-foreground md:block">
                        {it.description}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />

      <Lightbox
        items={items}
        index={active}
        onClose={() => setActive(null)}
        onIndexChange={setActive}
      />
    </div>
  );
}
