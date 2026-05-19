import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { OptimizedImage } from "./OptimizedImage";

export function Offers({ sectionId = "offers" }) {
  const { offers } = useSiteData();
  const activeOffers = offers.filter((offer) => offer.isActive !== false);

  if (!activeOffers.length) return null;

  return (
    <section id={sectionId || undefined} className="relative py-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex rounded-full glass px-4 py-1.5 text-xs font-medium text-accent">
              Recent updates
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              Recent <span className="text-gradient">Products</span> or <span className="text-gradient">Repairing</span>
            </h2>
          </div>
          <a href="/booking" className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            Book a repair from recent updates <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activeOffers.map((offer, index) => (
            <motion.article
              key={offer._id || offer.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className="overflow-hidden rounded-2xl glass border-glow shadow-card"
            >
              {offer.imageUrl && (
                <OptimizedImage
                  src={offer.imageUrl}
                  alt={offer.title}
                  className="h-52 w-full object-cover"
                  loading="lazy"
                  width={640}
                  height={360}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              )}
              <div className="p-5" style={{ maxHeight: "300px" }}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-xl font-semibold" style={{paddingLeft:"8px"}}>{offer.title}</h3>
                  {offer.code && (
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-accent">
                      {offer.code}
                    </span>
                  )}
                </div>
                <div className="no-scrollbar" style={{ height:"100px", padding:"8px", overflowY:"auto", lineHeight:"1px"}}>
                  <p className="text-sm leading-6 text-muted-foreground">{offer.description}</p>
                </div>
                <div style={{width:"100%", background:"transparent", padding:"5px", position:"relative", top:"10px", display:"flex", alignItems:"center", justifyContent:"center"}}>
                  <a
                  href="/booking"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.02]"
                >
                  {offer.ctaLabel || "Book now"}
                </a>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
