import { memo, useMemo, useState } from "react";
import { Plug } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getIcon } from "./iconMap";
import { OptimizedImage } from "./OptimizedImage";
import { ProgressSliderDots } from "./ProgressSliderDots";
import { SnapCarousel } from "../ui/SnapCarousel";

function firstMediaUrl(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function FeaturedRepairCard({ card, eager = false }) {
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
    <article className="featured-repair-card relative overflow-hidden rounded-3xl border-glow p-6 shadow-elegant sm:p-8">
      <div className="relative z-[1] flex flex-col items-start">
        <div className="flex w-full items-center justify-between gap-3">
          {mediaUrl ? (
            <div className="featured-repair-thumb inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-glow">
              <OptimizedImage
                src={mediaUrl}
                alt={card.title || "Featured repair"}
                className="featured-repair-thumb-image"
                loading={eager ? "eager" : "lazy"}
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
          {card.badge ? (
            <span className="inline-flex rounded-full glass px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              {card.badge}
            </span>
          ) : null}
        </div>

        <h3 className="mt-6 font-display text-2xl font-bold text-foreground">{card.title}</h3>
        <p
          className="mt-2 text-sm text-muted-foreground"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minHeight: "4.9em",
          }}
          title={card.shortDescription || card.description}
        >
          {card.shortDescription || card.description}
        </p>

        <a
          href="/booking"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform duration-300 hover:scale-105"
          tabIndex={eager ? 0 : -1}
          aria-hidden={eager ? undefined : true}
        >
          Book this service
        </a>
      </div>
    </article>
  );
}

export const Carousel3D = memo(function Carousel3D({ sectionId = "featured-repairs" }) {
  const { products, content } = useSiteData();
  const section = content.featuredCarousel || {};
  const cards = useMemo(() => products.filter((product) => product.isFeatured).slice(0, 5), [products]);
  const [activeIndex, setActiveIndex] = useState(0);
  const total = cards.length;

  if (!cards.length) return null;

  return (
    <section id={sectionId || undefined} className="site-section relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hidden md:block">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-primary opacity-15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
        </div>

        <div className="relative mt-10 sm:mt-12">
          <SnapCarousel
            className="snap-carousel--featured"
            ariaLabel="Featured repairs"
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            loop
          >
            {cards.map((card, index) => (
              <FeaturedRepairCard
                key={card._id || card.slug || index}
                card={card}
                eager={index === activeIndex}
              />
            ))}
          </SnapCarousel>
        </div>

        <ProgressSliderDots
          count={total}
          activeIndex={activeIndex}
          onChange={setActiveIndex}
          intervalMs={5200}
          className="carousel-progress-dots"
          ariaLabel="Featured repair slides"
        />
      </div>
    </section>
  );
});
