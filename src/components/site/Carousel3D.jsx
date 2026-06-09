import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plug } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getIcon } from "./iconMap";
import { OptimizedImage } from "./OptimizedImage";

function firstMediaUrl(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

export function Carousel3D({ sectionId = "featured-repairs" }) {
  const { products, content } = useSiteData();
  const section = content.featuredCarousel || {};
  const cards = products.filter((product) => product.isFeatured).slice(0, 5);
  const [active, setActive] = useState(0);
  const total = cards.length;

  useEffect(() => {
    if (!total) return undefined;
    const id = setInterval(() => setActive((a) => (a + 1) % total), 4500);
    return () => clearInterval(id);
  }, [total]);

  if (!cards.length) return null;

  const go = (dir) => setActive((a) => (a + dir + total) % total);

  const getRel = (i) => {
    let d = i - active;
    if (d > total / 2) d -= total;
    if (d < -total / 2) d += total;
    return d;
  };

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

        <div className="relative mt-16 flex h-[440px] items-center justify-center [perspective:1400px]">
          {cards.map((card, i) => {
            const rel = getRel(i);
            const abs = Math.abs(rel);
            if (abs > 2) return null;
            const x = rel * 240;
            const rotateY = rel * -18;
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
              <motion.div
                key={card._id || card.slug}
                animate={{ x, rotateY, scale, opacity, z }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                style={{ zIndex: 10 - abs }}
                className="absolute w-[300px] sm:w-[340px] md:w-[380px] select-none"
                drag={rel === 0 ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60) go(1);
                  else if (info.offset.x > 60) go(-1);
                }}
                onClick={() => rel !== 0 && setActive(i)}
              >
                <div
                  className={`relative cursor-pointer overflow-hidden rounded-3xl border-glow p-8 shadow-elegant transition-shadow duration-500 bg-card/85 backdrop-blur-xl select-none ${
                    rel === 0 ? "shadow-glow" : ""
                  }`}
                >
                  <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-primary opacity-25 blur-3xl" />
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
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          <button
            aria-label="Previous featured repair"
            onClick={() => go(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full glass border-glow text-foreground transition-transform hover:scale-110"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {cards.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setActive(i)}
                className="touch-dot"
              >
                <span className={i === active ? "active" : ""} />
              </button>
            ))}
          </div>
          <button
            aria-label="Next featured repair"
            onClick={() => go(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full glass border-glow text-foreground transition-transform hover:scale-110"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
