import { ArrowRight, BadgePercent, CalendarClock, Sparkles } from "lucide-react";
import { useSiteData } from "../../context/SiteDataContext";
import { OptimizedImage } from "./OptimizedImage";

function offerDateLabel(offer = {}) {
  const value = offer.endsAt || offer.startsAt || offer.updatedAt;
  if (!value) return "Latest update";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(value));
  } catch (_error) {
    return "Latest update";
  }
}

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
          {activeOffers.map((offer) => (
            <article
              key={offer._id || offer.title}
              className="offer-card"
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
                    <BadgePercent className="h-9 w-9" />
                    <span>{offer.title || "Offer"}</span>
                  </div>
                )}
                <div className="offer-card-media-shade" />
                <div className="offer-card-status">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Recent</span>
                </div>
              </div>
              <div className="offer-card-body">
                <div className="offer-card-meta-row">
                  <span className="offer-card-date">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {offerDateLabel(offer)}
                  </span>
                  {offer.code ? <span className="offer-card-code">{offer.code}</span> : null}
                </div>
                <h3 className="offer-card-title font-display">{offer.title}</h3>
                <p className="offer-card-description text-muted-foreground">{offer.description}</p>
                <div className="offer-card-action">
                  <a
                    href={offer.ctaHref || "/booking"}
                    className="offer-card-button"
                  >
                    <span>{offer.ctaLabel || "Book now"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
