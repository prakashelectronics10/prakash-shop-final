import { useMemo, useRef, useState } from "react";
import { ArrowRight, Plug } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getIcon } from "./iconMap";
import { SectionFallback } from "./SectionFallback";
import { OptimizedImage } from "./OptimizedImage";
import { SnapCarousel } from "../ui/SnapCarousel";

const SERVICES_CAROUSEL_LIMIT = 12;

function firstServiceImage(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function ServiceFanCard({ card, loadImages = true, priority = false }) {
  const Icon = getIcon(card.iconName, Plug);
  const highlights = Array.isArray(card.highlights)
    ? card.highlights.filter(Boolean).slice(0, 2)
    : [];

  return (
    <div className="relative h-full w-full overflow-hidden bg-card">
      <div className="absolute inset-0">
        {card.imgUrl && loadImages ? (
          <OptimizedImage
            src={card.imgUrl}
            alt={card.alt || card.title}
            width={360}
            height={560}
            sizes="(min-width: 1024px) 264px, (min-width: 768px) 224px, 78vw"
            className="h-full w-full object-cover"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-secondary to-accent/30">
            <div className="absolute inset-0 bg-gradient-hero opacity-80" />
            <Icon
              className="absolute right-3 top-1/2 h-28 w-28 -translate-y-1/2 text-white/[0.08] sm:h-36 sm:w-36"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-accent/15 opacity-80" />

      <div className="relative z-10 flex h-full flex-col justify-between p-3.5 sm:p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl glass-strong border border-primary/35 shadow-glow sm:h-12 sm:w-12 sm:rounded-2xl">
            {card.iconImageUrl && loadImages ? (
              <OptimizedImage
                src={card.iconImageUrl}
                alt=""
                width={48}
                height={48}
                sizes="48px"
                className="h-full w-full object-cover"
                loading={priority ? "eager" : "lazy"}
                draggable={false}
              />
            ) : (
              <Icon className="h-5 w-5 text-accent sm:h-6 sm:w-6" />
            )}
          </div>

          {card.badge ? (
            <span className="max-w-[58%] truncate rounded-full glass-strong px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-accent sm:px-2.5 sm:text-[10px]">
              {card.badge}
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          {card.categoryName ? (
            <p className="mb-1 truncate text-[10px] font-medium uppercase tracking-wide text-accent/90 sm:text-[11px]">
              {card.categoryName}
            </p>
          ) : null}

          <h3 className="font-display text-[15px] font-semibold leading-snug text-white sm:text-lg md:text-xl">
            {card.title}
          </h3>

          {card.description ? (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-white/80 sm:mt-2 sm:text-xs md:text-[13px] md:leading-5">
              {card.description}
            </p>
          ) : null}

          {highlights.length ? (
            <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
              {highlights.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-white/85"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent sm:mt-4 sm:text-xs">
            {card.ctaLabel || "Learn more"}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function Services({ sectionId = "services" }) {
  const { products, content, loading } = useSiteData();
  const section = content.servicesSection || {};
  const [activeIndex, setActiveIndex] = useState(0);
  const swipeGuardRef = useRef({ x: 0, y: 0, moved: false });

  const cards = useMemo(
    () => {
      const featured = products.filter(
        (product) => product.featured || product.isFeatured || product.showInServices || product.homepageFeatured,
      );
      const source = (featured.length ? featured : products).slice(0, SERVICES_CAROUSEL_LIMIT);

      return source.map((product) => {
        const title = product.title || product.name || "Service";
        const coverImage = firstServiceImage(
          product.imageUrl,
          product.image,
          product.photoUrl,
          product.url,
          product.src,
          product.coverImageUrl,
        );
        const iconImageUrl = firstServiceImage(
          product.iconImageUrl,
          product.iconUrl,
          product.iconImage,
          product.iconImage?.url,
          product.icon?.url,
        );

        return {
          id: product._id || product.slug || title,
          imgUrl: coverImage || iconImageUrl,
          iconImageUrl:
            iconImageUrl && iconImageUrl !== coverImage ? iconImageUrl : "",
          alt: title,
          title,
          description: product.shortDescription || product.description || "",
          badge: product.badge || "",
          categoryName: product.categoryName || product.category || "",
          highlights: product.highlights || [],
          iconName: product.iconName || product.icon || product.iconKey || "Plug",
          ctaLabel: product.ctaLabel || "Learn more",
          linkUrl: `/learn-more?service=${encodeURIComponent(product.slug || "")}`,
        };
      });
    },
    [products],
  );

  if (!products.length && loading) return <SectionFallback />;
  if (!products.length) return null;

  return (
    <section id={sectionId || undefined} className="site-section relative overflow-x-hidden overflow-y-visible">
      <div className="pointer-events-none absolute left-1/2 top-20 h-72 w-[80%] -translate-x-1/2 rounded-full bg-gradient-primary opacity-10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
          <p className="mt-4 text-muted-foreground">{section.description}</p>
        </div>

        <div className="relative mt-8 sm:mt-10">
          <SnapCarousel
            className="snap-carousel--services"
            ariaLabel="Services"
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
          >
            {cards.map((card, index) => {
              const loadImages = Math.abs(index - activeIndex) <= 1;
              const priority = index === activeIndex;
              const cardNode = (
                <ServiceFanCard card={card} loadImages={loadImages} priority={priority} />
              );
              return card.linkUrl ? (
                <a
                  key={card.id}
                  href={card.linkUrl}
                  className="block h-full outline-none [touch-action:pan-x]"
                  aria-label={card.alt || card.title}
                  tabIndex={index === activeIndex ? 0 : -1}
                  draggable={false}
                  onPointerDown={(event) => {
                    swipeGuardRef.current = { x: event.clientX, y: event.clientY, moved: false };
                  }}
                  onPointerMove={(event) => {
                    const start = swipeGuardRef.current;
                    if (!start || start.moved) return;
                    if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
                      swipeGuardRef.current = { ...start, moved: true };
                    }
                  }}
                  onClick={(event) => {
                    if (swipeGuardRef.current.moved) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                >
                  {cardNode}
                </a>
              ) : (
                <ServiceFanCard key={card.id} card={card} loadImages={loadImages} priority={priority} />
              );
            })}
          </SnapCarousel>
        </div>
      </div>
    </section>
  );
}
