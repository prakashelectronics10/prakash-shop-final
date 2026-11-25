import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Expand, Images } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { GALLERY_DESKTOP_QUERY, normalizeGalleryItems } from "../../utils/gallery";
import { Footer } from "./Footer";
import { GalleryGrid } from "./GalleryGrid";
import { Lightbox } from "./Lightbox";
import { Navbar } from "./Navbar";
import { OptimizedImage } from "./OptimizedImage";

export function GalleryPage() {
  const { content } = useSiteData();
  const section = content.gallery || {};
  const items = useMemo(() => normalizeGalleryItems(content.gallery), [content.gallery]);
  const [active, setActive] = useState(null);
  const [desktop, setDesktop] = useState(() => window.matchMedia(GALLERY_DESKTOP_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(GALLERY_DESKTOP_QUERY);
    const update = () => setDesktop(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

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
            <GalleryGrid
              items={items}
              mode={desktop ? "desktop" : "mobile"}
              renderTile={(it, i) => (
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Open ${it.label} in lightbox`}
                    className="gallery-tile group cursor-zoom-in overflow-hidden rounded-3xl border-glow shadow-card text-left md:glass"
                  >
                    <OptimizedImage
                      src={it.src}
                      alt={it.label}
                      loading={i < 4 ? "eager" : "lazy"}
                      decoding="async"
                      width={960}
                      sizes="(min-width: 1200px) 600px, (min-width: 768px) 50vw, 85vw"
                      className="gallery-tile-image h-full w-full object-cover"
                    />
                    <div className="gallery-tile-expand absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
                        <Expand className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>
                  </button>
              )}
            />
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
