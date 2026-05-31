import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Plug } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { getIcon } from "./iconMap";
import { SectionFallback } from "./SectionFallback";
import { OptimizedImage } from "./OptimizedImage";

export function Services({ sectionId = "services" }) {
  const { products, content, loading } = useSiteData();
  const section = content.servicesSection || {};

  if (!products.length && loading) return <SectionFallback />;
  if (!products.length) return null;

  return (
    <section id={sectionId || undefined} className="relative py-24">
      <div className="pointer-events-none absolute left-1/2 top-20 h-72 w-[80%] -translate-x-1/2 rounded-full bg-gradient-primary opacity-10 blur-3xl" />
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
            {section.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl md:text-5xl">
            {section.title} <span className="text-gradient">{section.highlight}</span>
          </h2>
          <p className="mt-4 text-muted-foreground">{section.description}</p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product, i) => {
            const Icon = getIcon(product.iconName, Plug);
            return (
              <motion.article
                key={product._id || product.slug}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.04 }}
                className="group relative flex min-h-[430px] overflow-hidden rounded-2xl glass border-glow shadow-card transition-all duration-500 hover:-translate-y-1.5"
              >
                <OptimizedImage
                  src={product.imageUrl}
                  alt={product.title}
                  loading="lazy"
                  width={420}
                  height={560}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="absolute inset-0 h-full w-full object-cover opacity-30 transition duration-700 group-hover:scale-105 group-hover:opacity-40"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/35" />
                <div className="relative flex w-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    {product.iconImageUrl ? (
                      <img src={product.iconImageUrl} alt="" className="h-12 w-12 rounded-2xl border border-primary/30 object-cover shadow-glow transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110" loading="lazy" />
                    ) : (
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl glass-strong border border-primary/30 shadow-glow transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110">
                        <Icon className="h-6 w-6 text-accent" />
                      </div>
                    )}
                    {product.badge && (
                      <span className="rounded-full glass-strong px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        {product.badge}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-20">
                    <h3 className="font-display text-xl font-semibold leading-tight">{product.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {product.shortDescription || product.description}
                    </p>

                    <div className="mt-5 grid gap-2">
                      {(product.highlights || []).map((item) => (
                        <div key={item} className="flex items-center gap-2 text-xs text-foreground/85">
                          <BadgeCheck className="h-4 w-4 text-accent" />
                          {item}
                        </div>
                      ))}
                    </div>

                    <a
                      href={`/learn-more?service=${encodeURIComponent(product.slug)}`}
                      className="mt-6 inline-flex w-full items-center justify-between rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-transform duration-300 hover:scale-[1.02]"
                    >
                      {product.ctaLabel || "Learn more"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </a>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
