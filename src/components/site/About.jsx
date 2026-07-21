import { Clock } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getIcon } from "./iconMap";
import { OptimizedImage } from "./OptimizedImage";

export function About({ sectionId = "about" }) {
  const { content } = useSiteData();
  const about = content.about || {};
  const reasons = (about.reasons || []).filter((reason) => reason.isActive !== false);

  if (!about.title && !reasons.length) return null;

  return (
    <section id={sectionId || undefined} className="relative py-24">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {about.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {about.title} <span className="text-gradient">{about.highlight}</span>
          </h2>
          <p className="mt-4 text-muted-foreground">{about.description}</p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map((reason) => {
            const Icon = getIcon(reason.iconName, Clock);
            const image = reason.iconImageUrl || reason.imageUrl || "";
            return (
              <div
                key={reason.title}
                className="group relative overflow-hidden rounded-2xl glass border-glow p-6 transition-transform duration-300 hover:-translate-y-1 select-none"
              >
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-primary opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30" />
                <div className="relative">
                  {image ? (
                    <OptimizedImage src={image} alt="" width={96} height={96} sizes="48px" className="mb-4 h-12 w-12 rounded-xl object-cover shadow-glow" loading="lazy" />
                  ) : (
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                  )}
                  <h3 className="font-display text-lg font-semibold">{reason.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{reason.description || reason.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
