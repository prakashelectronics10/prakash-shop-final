import { useEffect, useMemo, useRef } from "react";
import { useSiteData } from "../../context/SiteDataContext";
import { OptimizedImage } from "./OptimizedImage";

const HIGHLIGHT_TILTS = [-1.1, 1.1, -0.85, 0.95];

function safeHighlightLink(value) {
  const link = String(value || "").trim();
  if (!link) return "";
  if ((link.startsWith("/") && !link.startsWith("//")) || link.startsWith("#")) return link;
  try {
    const url = new URL(link);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch (_error) {
    return "";
  }
}

function HighlightMedia({ item, index }) {
  const source = item.originalUrl || item.imageUrl || item.src || item.url;
  const image = (
    <OptimizedImage
      src={source}
      alt={item.alt || `Shop highlight ${index + 1}`}
      width={1920}
      height={800}
      sizes="(min-width: 1024px) 920px, calc(100vw - 32px)"
      loading={index === 0 ? "eager" : "lazy"}
      fetchPriority={index === 0 ? "auto" : "low"}
      decoding="async"
      className="shop-highlight-image"
      draggable={false}
    />
  );
  const href = safeHighlightLink(item.linkUrl || item.link || item.href);

  if (!href) return <div className="shop-highlight-card">{image}</div>;

  const external = /^https?:\/\//i.test(href);
  return (
    <a
      className="shop-highlight-card"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      aria-label={item.alt ? `Open ${item.alt}` : `Open shop highlight ${index + 1}`}
    >
      {image}
    </a>
  );
}

export function ShopHighlights({ sectionId = "shop-highlights" }) {
  const { content } = useSiteData();
  const section = content.shopHighlights || {};
  const headingRef = useRef(null);
  const lastCardRef = useRef(null);
  const items = useMemo(
    () => (Array.isArray(section.items) ? section.items : [])
      .filter((item) => item?.imageUrl || item?.src || item?.url)
      .slice(0, 20),
    [section.items],
  );

  useEffect(() => {
    const heading = headingRef.current;
    const lastCard = lastCardRef.current;
    if (!heading || !lastCard) return undefined;

    let frame = 0;
    const syncHeadingVisibility = () => {
      frame = 0;
      const stickyTop = Number.parseFloat(window.getComputedStyle(lastCard).top);
      const lastCardTop = lastCard.getBoundingClientRect().top;
      const isStackExiting = Number.isFinite(stickyTop) && lastCardTop < stickyTop - 1;
      heading.classList.toggle("is-stack-exiting", isStackExiting);
    };
    const scheduleSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncHeadingVisibility);
    };

    syncHeadingVisibility();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });
    return () => {
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      if (frame) window.cancelAnimationFrame(frame);
      heading.classList.remove("is-stack-exiting");
    };
  }, [items]);

  if (!items.length) return null;

  return (
    <section id={sectionId || undefined} className="site-section shop-highlights-section">
      <div className="mx-auto max-w-7xl px-4">
        <header ref={headingRef} className="shop-highlights-heading">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow || "Discover"}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title || "Shop"} <span className="text-gradient">{section.highlight || "highlights"}</span>
          </h2>
        </header>

        <div className="shop-highlights-stack" role="list" aria-label="Shop highlight links">
          {items.map((item, index) => (
            <article
              ref={index === items.length - 1 ? lastCardRef : undefined}
              className="shop-highlight-sticky"
              key={`${item.imageUrl || item.src}-${index}`}
              role="listitem"
              style={{
                "--highlight-offset": `${Math.min(index, 8) * 10}px`,
                "--highlight-mobile-offset": `${Math.min(index, 8) * 7}px`,
                "--highlight-small-offset": `${Math.min(index, 8) * 6}px`,
                "--highlight-tilt": `${HIGHLIGHT_TILTS[index % HIGHLIGHT_TILTS.length]}deg`,
                zIndex: index + 1,
              }}
            >
              <HighlightMedia item={item} index={index} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
