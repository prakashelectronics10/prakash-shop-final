import { useEffect, useState } from "react";
import { Calendar, Phone, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getPhoneHref, contactDigits } from "../../utils/contactDefaults";
import { getIcon } from "./iconMap";
import { OptimizedImage } from "./OptimizedImage";

const fallbackHero = {
  eyebrow: "Trusted by 25,000+ customers since 2009",
  title: "Premium Repair for",
  highlight: "Home appliances",
  titleSuffix: "You Own",
  description:
    "From fan to television, Prakash Electronics delivers expert diagnostics, genuine parts and same-day service. You can also buy electronics products like ceiling fan, rechargeable torch, speaker and daily-use electrical items.",
  primaryCta: { label: "Book Repair", href: "#contact" },
  secondaryCta: { label: "Call Now", href: "tel:+916200267880" },
  image: {
    url: "/seed-assets/hero-technician.jpg",
    alt: "Expert electronics repair technician at work",
  },
  trustBadges: [
    { iconName: "ShieldCheck", label: "90-day warranty" },
    { iconName: "Star", label: "4.9/5 (3,200 reviews)" },
  ],
  floatingBadges: [
    { label: "Repairs today", value: "+128" },
    { label: "Satisfaction", value: "99%" },
  ],
};

function HeroImageSlider({ slides, fallbackImage, floatingBadges }) {
  const fallback = fallbackImage?.url ? [{ id: "fallback", imageUrl: fallbackImage.url, alt: fallbackImage.alt || "Prakash Electronics service" }] : [];
  const items = slides.length ? slides : fallback;
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setPreviousIndex(null);
  }, [items.length, reduceMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (items.length < 2 || reduceMotion) return undefined;
    const timer = window.setInterval(() => setActiveIndex((index) => {
      setPreviousIndex(index);
      return (index + 1) % items.length;
    }), 4500);
    return () => window.clearInterval(timer);
  }, [items.length, reduceMotion]);

  return (
    <div className="hero-media-card relative mx-auto w-full max-w-lg">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-primary opacity-35 blur-2xl" />
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl glass-strong border-glow shadow-elegant">
        {items.map((slide, index) => (index === activeIndex || index === previousIndex ? (
          <OptimizedImage key={slide.id || `${slide.imageUrl}-${index}`} src={slide.imageUrl} alt={slide.alt || slide.title || "Prakash Electronics product"} width={960} height={720} sizes="(min-width: 1024px) 42vw, 92vw" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeIndex ? "opacity-100" : "opacity-0"}`} fetchPriority={index === activeIndex && activeIndex === 0 ? "high" : "auto"} />
        ) : null))}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        {floatingBadges[0] && <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl glass-strong p-3"><div><div className="text-xs text-muted-foreground">{floatingBadges[0].label}</div><div className="font-display text-lg font-bold">{floatingBadges[0].value}</div></div><div className="rounded-xl bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-glow">Live now</div></div>}
        {items.length > 1 && <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 gap-2">{items.map((slide, index) => <button key={slide.id || index} type="button" aria-label={`Show slide ${index + 1}`} onClick={() => { setPreviousIndex(activeIndex); setActiveIndex(index); }} className={`h-2 w-2 rounded-full transition ${index === activeIndex ? "bg-accent scale-125" : "bg-white/50"}`} />)}</div>}
      </div>
      {floatingBadges.slice(0, 2).map((badge, index) => <div key={`${badge.label}-${index}`} className={`hero-floating-badge absolute hidden rounded-2xl glass-strong px-4 py-3 shadow-card md:block ${index === 0 ? "-left-6 top-12" : "-right-4 bottom-24"}`}><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{badge.label}</div><div className="font-display text-xl font-bold text-gradient">{badge.value}</div></div>)}
    </div>
  );
}

export function Hero() {
  const { hero, contact, heroSlider = [] } = useSiteData();
  const heroData = hero || fallbackHero;

  const primaryCta = heroData.primaryCta || {};
  const secondaryCta = heroData.secondaryCta || {};
  const secondaryHref = String(secondaryCta.href || "").trim();
  const isLegacyPhoneHref = secondaryHref.startsWith("tel:") && ["9006608566", "919006608566"].includes(contactDigits(secondaryHref));
  const callHref = !secondaryHref || secondaryHref === "#contact" || isLegacyPhoneHref
    ? getPhoneHref(contact)
    : secondaryHref;
  const trustBadges = heroData.trustBadges || [];
  const floatingBadges = heroData.floatingBadges || [];

  return (
    <section id="home" className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-[500px] w-[500px] rounded-full bg-gradient-primary opacity-25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-accent/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 lg:grid-cols-2 lg:gap-8 lg:items-center">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {heroData.eyebrow}
          </div>

          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            {heroData.title} <span className="text-gradient">{heroData.highlight}</span> {heroData.titleSuffix}
          </h1>

          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            {heroData.description}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/booking"
              className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform duration-300 hover:scale-105"
            >
              <Calendar className="h-4 w-4" /> {primaryCta.label || "Book Repair"}
            </a>
            <a
              href={callHref}
              className="inline-flex items-center gap-2 rounded-xl glass border-glow px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <Phone className="h-4 w-4 text-accent" /> {secondaryCta.label || "Call Now"}
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            {trustBadges.map((badge, index) => {
              const Icon = getIcon(badge.iconName, index === 0 ? ShieldCheck : Star);
              const isRating = badge.iconName === "Star";
              return (
                <div className="flex items-center gap-2" key={`${badge.label}-${index}`}>
                  {isRating ? (
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                      ))}
                    </div>
                  ) : (
                    <Icon className="h-5 w-5 text-accent" />
                  )}
                  {badge.label}
                </div>
              );
            })}
          </div>
        </div>

        <HeroImageSlider slides={heroSlider} fallbackImage={heroData.image} floatingBadges={floatingBadges} />
      </div>
    </section>
  );
}
