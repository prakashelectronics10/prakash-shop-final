import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../api/client";
import { OptimizedImage } from "./OptimizedImage";

function buildLoopItems(items, loopCopies) {
  if (!items.length) return [];
  return Array.from({ length: loopCopies }, (_, copy) =>
    items.map((item, index) => ({
      item,
      key: `brand-${copy}-${item._id || item.imageUrl}-${index}`,
    })),
  ).flat();
}

export function BrandsMarquee() {
  const [brands, setBrands] = useState([]);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageHidden, setPageHidden] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    apiRequest("/brand-sliders/public", { cacheTtl: 5 * 60 * 1000 })
      .then((response) => {
        if (!mounted) return;
        setBrands(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        if (mounted) setBrands([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        setInView(entries.some((entry) => entry.isIntersecting));
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

  const loopCopies = brands.length > 0 && brands.length < 6 ? 4 : 2;
  const loopItems = useMemo(() => buildLoopItems(brands, loopCopies), [brands, loopCopies]);
  const durationSec = Math.max(28, brands.length * 4);
  const isPaused = paused || !inView || pageHidden;

  if (!brands.length) return null;

  return (
    <section
      ref={sectionRef}
      className="brands-marquee-section"
      aria-label="Brand partners"
    >
      <div
        className="brands-marquee"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        style={{
          "--brands-marquee-duration": `${durationSec}s`,
          "--brands-loop-span": `-${100 / loopCopies}%`,
        }}
      >
        <div className={`brands-marquee-track${isPaused ? " is-paused" : ""}`}>
          {loopItems.map(({ item, key }, loopIndex) => (
            <div className="brands-marquee-item" key={key}>
              <OptimizedImage
                src={item.imageUrl}
                alt={item.name || "Brand"}
                loading={loopIndex < 4 ? "eager" : "lazy"}
                decoding="async"
                width={160}
                height={64}
                sizes="(max-width: 760px) 28vw, 140px"
                className="brands-marquee-logo"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
