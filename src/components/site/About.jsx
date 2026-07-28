import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getIcon } from "./iconMap";
import { OptimizedImage } from "./OptimizedImage";
import { CardStack } from "../ui/card-stack";

function firstMediaUrl(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function useCardStackLayout() {
  const [layout, setLayout] = useState({
    cardWidth: 520,
    cardHeight: 320,
    maxVisible: 7,
    overlap: 0.48,
    spreadDeg: 48,
    depthPx: 140,
    tiltXDeg: 12,
    activeLiftPx: 22,
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 480) {
        setLayout({
          cardWidth: Math.min(300, w - 48),
          cardHeight: 240,
          maxVisible: 3,
          overlap: 0.58,
          spreadDeg: 28,
          depthPx: 90,
          tiltXDeg: 10,
          activeLiftPx: 14,
        });
      } else if (w < 768) {
        setLayout({
          cardWidth: Math.min(380, w - 64),
          cardHeight: 280,
          maxVisible: 5,
          overlap: 0.52,
          spreadDeg: 36,
          depthPx: 110,
          tiltXDeg: 11,
          activeLiftPx: 18,
        });
      } else if (w < 1024) {
        setLayout({
          cardWidth: 440,
          cardHeight: 300,
          maxVisible: 5,
          overlap: 0.5,
          spreadDeg: 42,
          depthPx: 120,
          tiltXDeg: 12,
          activeLiftPx: 20,
        });
      } else {
        setLayout({
          cardWidth: 520,
          cardHeight: 320,
          maxVisible: 7,
          overlap: 0.48,
          spreadDeg: 48,
          depthPx: 140,
          tiltXDeg: 12,
          activeLiftPx: 22,
        });
      }
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}

function AboutReasonCard({ item, active }) {
  const Icon = getIcon(item.iconName, Clock);
  const image = item.imageSrc || "";
  const description = item.description || "";

  return (
    <div className="relative h-full w-full overflow-hidden bg-card">
      <div className="absolute inset-0">
        {image ? (
          <OptimizedImage
            src={image}
            alt={item.title}
            width={720}
            height={480}
            sizes="(min-width: 1024px) 520px, (min-width: 768px) 440px, 90vw"
            className={`h-full w-full object-cover transition duration-700 ${
              active ? "scale-105 opacity-100" : "scale-100 opacity-90"
            }`}
            loading={active ? "eager" : "lazy"}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/35 via-secondary to-accent/25">
            <div className="absolute inset-0 bg-gradient-hero opacity-80" />
            <div className="absolute -right-8 -top-10 hidden h-44 w-44 rounded-full bg-gradient-primary opacity-40 blur-3xl md:block" />
            <div className="absolute -bottom-16 -left-10 hidden h-48 w-48 rounded-full bg-accent/30 blur-3xl md:block" />
            <Icon
              className="absolute right-5 top-1/2 h-36 w-36 -translate-y-1/2 text-white/[0.08]"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/10 opacity-70" />

      <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl glass-strong border border-primary/35 shadow-glow sm:h-14 sm:w-14">
            {item.iconImageSrc ? (
              <OptimizedImage
                src={item.iconImageSrc}
                alt=""
                width={56}
                height={56}
                sizes="56px"
                className="h-full w-full object-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <Icon className="h-6 w-6 text-accent sm:h-7 sm:w-7" />
            )}
          </div>

          {item.tag ? (
            <span className="rounded-full glass-strong px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              {item.tag}
            </span>
          ) : null}
        </div>

        <div className="max-w-[95%]">
          <h3 className="font-display text-xl font-semibold leading-tight text-white sm:text-2xl">
            {item.title}
          </h3>
          {description ? (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/80 sm:text-[15px]">
              {description}
            </p>
          ) : null}
          {item.ctaLabel && item.href ? (
            <span className="mt-3 inline-flex text-xs font-semibold uppercase tracking-wide text-accent">
              {item.ctaLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function About({ sectionId = "about" }) {
  const { content } = useSiteData();
  const about = content.about || {};
  const layout = useCardStackLayout();
  const reasons = (about.reasons || []).filter((reason) => reason.isActive !== false);

  const items = useMemo(
    () =>
      reasons.map((reason, index) => {
        const coverImage = firstMediaUrl(
          reason.imageUrl,
          reason.coverImageUrl,
          reason.image,
          reason.photoUrl,
          reason.src,
        );
        const iconImage = firstMediaUrl(reason.iconImageUrl, reason.iconUrl);
        return {
          id: reason.id || reason._id || `${reason.title || "reason"}-${index}`,
          title: reason.title || "About",
          description: reason.description || reason.desc || "",
          // Prefer cover image; fall back to icon image so DB media always shows.
          imageSrc: coverImage || iconImage,
          iconImageSrc: iconImage && iconImage !== coverImage ? iconImage : "",
          href: reason.href || reason.link || reason.ctaHref || "",
          ctaLabel: reason.ctaLabel || "",
          tag: reason.tag || reason.badge || "",
          iconName: reason.iconName || reason.icon || reason.iconKey || "Clock",
        };
      }),
    [reasons],
  );

  if (!about.title && !items.length) return null;

  return (
    <section id={sectionId || undefined} className="site-section relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hidden md:block">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-primary opacity-15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {about.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {about.title} <span className="text-gradient">{about.highlight}</span>
          </h2>
          <p className="mt-4 text-muted-foreground">{about.description}</p>
        </div>

        {items.length ? (
          <div className="mt-10 sm:mt-14">
            <CardStack
              items={items}
              initialIndex={0}
              autoAdvance
              intervalMs={4200}
              slideDuration={0.9}
              slideEase={[0.22, 1, 0.36, 1]}
              pauseOnHover
              showDots
              showArrows
              loop
              cardWidth={layout.cardWidth}
              cardHeight={layout.cardHeight}
              maxVisible={layout.maxVisible}
              overlap={layout.overlap}
              spreadDeg={layout.spreadDeg}
              depthPx={layout.depthPx}
              tiltXDeg={layout.tiltXDeg}
              activeLiftPx={layout.activeLiftPx}
              renderCard={(item, state) => (
                <AboutReasonCard item={item} active={state.active} />
              )}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
