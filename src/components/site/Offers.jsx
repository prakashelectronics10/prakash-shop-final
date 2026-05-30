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

        <div className="offers-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activeOffers.map((offer, index) => (
            <motion.article
              key={offer._id || offer.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className="offer-card glass border-glow shadow-card"
            >
              <div className="offer-card-media">
                {offer.imageUrl ? (
                  <OptimizedImage
                    src={offer.imageUrl}
                    alt={offer.title}
                    className="offer-card-image"
                    loading="lazy"
                    width={720}
                    height={405}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                ) : (
                  <div className="offer-card-image-fallback">
                    <span>{offer.title || "Offer"}</span>
                  </div>
                )}
              </div>
              <div className="offer-card-body">
                <div className="offer-card-head">
                  <h3 className="offer-card-title font-display">{offer.title}</h3>
                  {offer.code && (
                    <span className="offer-card-code">
                      {offer.code}
                    </span>
                  )}
                </div>
                <p className="offer-card-description text-muted-foreground">{offer.description}</p>
                <div className="offer-card-action">
                  <a
                  href="/booking"
                  className="offer-card-button bg-gradient-primary text-primary-foreground shadow-glow"
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
