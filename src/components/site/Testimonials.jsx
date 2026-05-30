import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { OptimizedImage } from "./OptimizedImage";

export function Testimonials({ sectionId = "testimonials" }) {
  const { content } = useSiteData();
  const section = content.testimonials || {};
  const reviews = section.items || [];
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!reviews.length) return undefined;
    const id = setInterval(() => setI((x) => (x + 1) % reviews.length), 5000);
    return () => clearInterval(id);
  }, [reviews.length]);

  if (!reviews.length) return null;

  const active = reviews[i] || reviews[0];
  const activeText = active.text || active.quote || active.review || "";
  const activeImage = active.imageUrl || active.photoUrl || active.url || "";
  const activeAvatar = active.avatar || String(active.name || "")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section id={sectionId || undefined} className="relative py-24">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
        </div>

        <div className="relative mt-12 h-[320px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
              className="relative mx-auto max-w-3xl rounded-3xl glass-strong border-glow p-8 shadow-elegant md:p-12"
            >
              <Quote className="absolute right-8 top-8 h-12 w-12 text-primary/20" />
              <div className="flex gap-1">
                {Array.from({ length: active.rating || 5 }).map((_, k) => (
                  <Star key={k} className="h-5 w-5 fill-accent text-accent" />
                ))}
              </div>
              <p className="mt-6 font-display text-lg leading-relaxed md:text-2xl">
                "{activeText}"
              </p>
              <div className="mt-8 flex items-center gap-4">
                {activeImage ? (
                  <OptimizedImage src={activeImage} alt={active.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover shadow-glow" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary font-bold text-primary-foreground shadow-glow">
                    {activeAvatar}
                  </div>
                )}
                <div>
                  <div className="font-semibold">{active.name}</div>
                  <div className="text-sm text-muted-foreground">{active.role}</div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {reviews.map((_, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-label={`Review ${k + 1}`}
              className="touch-dot"
            >
              <span className={k === i ? "active" : ""} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
