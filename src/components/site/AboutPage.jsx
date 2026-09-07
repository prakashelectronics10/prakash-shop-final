import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useMemo } from "react";
import { useSiteData } from "../../context/SiteDataContext";
import { AboutStoryShowcase } from "./AboutStoryShowcase";
import { FaqSection } from "./FaqSection";
import { Footer } from "./Footer";
import { getIcon } from "./iconMap";
import { Navbar } from "./Navbar";
import { OptimizedImage } from "./OptimizedImage";
import { SocialChannels } from "./SocialChannels";

function firstImage(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function itemImage(item = {}) {
  return firstImage(
    item.originalUrl,
    item.imageUrl,
    item.coverImageUrl,
    item.image,
    item.photoUrl,
    item.src,
  );
}

function findGalleryImage(items, terms) {
  const match = items.find((item) => {
    const searchable = `${item.label || ""} ${item.caption || ""}`.toLowerCase();
    return terms.some((term) => searchable.includes(term));
  });
  return itemImage(match) || itemImage(items[0]);
}

const PAGE_PRINCIPLES = [
  { iconName: "Wrench", title: "Careful diagnosis", description: "We identify the actual fault before recommending a repair or replacement." },
  { iconName: "Wallet", title: "Clear pricing", description: "Customers receive a practical explanation and a clear estimate before work begins." },
  { iconName: "Award", title: "Experienced workmanship", description: "More than two decades of hands-on electronics service informs every repair." },
  { iconName: "Cog", title: "Suitable parts", description: "Parts and accessories are selected for compatibility, value, and dependable use." },
  { iconName: "Home", title: "Convenient support", description: "Workshop service and available home-visit support make repairs easier to arrange." },
  { iconName: "ShieldCheck", title: "Tested delivery", description: "Completed work is checked for safe, stable operation before it is returned." },
];

const PAGE_OFFERINGS = [
  "TV, fan, speaker, induction, cooler, and household electronics repair",
  "Wiring accessories, switches, sockets, wires, MCBs, and electrical fittings",
  "Electronics products, useful home appliances, lights, and accessories",
  "Product selection guidance, availability support, and repair booking",
];

const ABOUT_FAQS = [
  {
    question: "Which electronics do you repair?",
    answer: "We handle common household electronics and appliances including TVs, fans, speakers, induction cooktops, coolers, and related electrical products. Contact the workshop with the model and issue for confirmation.",
  },
  {
    question: "Do you provide an estimate before repair?",
    answer: "Yes. The device is checked first, then the likely work and expected cost are explained before the repair moves ahead.",
  },
  {
    question: "Can I also buy products and electrical accessories?",
    answer: "Yes. Prakash Electronics supplies selected electronics, useful home appliances, wiring accessories, switches, sockets, wires, MCBs, lights, and compatible parts.",
  },
  {
    question: "Is home service available?",
    answer: "Home visits may be available for suitable jobs and nearby locations. Availability depends on the product, fault, location, and schedule.",
  },
];

export function AboutPage() {
  const { content } = useSiteData();
  const about = content.about || {};
  const galleryItems = useMemo(
    () => (Array.isArray(content.gallery?.items) ? content.gallery.items : []),
    [content.gallery],
  );
  const stats = Array.isArray(content.stats?.items) ? content.stats.items.slice(0, 4) : [];
  const workshopImage = useMemo(
    () => findGalleryImage(galleryItems, ["workshop", "shop", "sales"]),
    [galleryItems],
  );

  return (
    <div className="App about-page">
      <Navbar />
      <main>
        <section className="about-page-hero">
          <div className="about-page-hero-inner">
            <a className="internal-page-back" href="/#home">
              <ArrowLeft size={17} aria-hidden="true" />
              Back to home
            </a>
            <p className="internal-page-kicker">{about.eyebrow || "About us"}</p>
            <h1>Prakash <span>Electronics</span></h1>
            <p className="about-page-hero-copy">
              Trusted electronics sales, careful diagnostics, and practical repair support for Chitarpur and nearby communities.
            </p>
            <ul className="internal-page-hero-points" aria-label="Prakash Electronics services">
              <li>Repair expertise</li>
              <li>Electronics sales</li>
              <li>Local support</li>
            </ul>
            <div className="about-page-hero-actions">
              <a className="internal-page-primary" href="/booking">
                Book a repair <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a className="internal-page-secondary" href="/contact">Contact the workshop</a>
            </div>
          </div>
        </section>

        <section className="about-page-story">
          <div className="about-page-story-copy">
            <p className="internal-page-kicker">Who we are</p>
            <h2>A local electronics workshop built on <span className="text-gradient">dependable service</span></h2>
            <p>{about.description || "Prakash Electronics combines experienced repair work with useful electronics and electrical products for homes and businesses."}</p>
            <p>
              Every request starts with understanding the actual problem. Our focus is clear communication, sensible recommendations, tested work, and products that suit the customer&apos;s requirement.
            </p>
          </div>
          <div className="about-page-story-media">
            {workshopImage ? (
              <OptimizedImage
                src={workshopImage}
                alt="Inside the Prakash Electronics workshop"
                width={1080}
                height={810}
                sizes="(min-width: 960px) 44vw, 100vw"
                className="about-page-story-image"
                loading="lazy"
              />
            ) : (
              <img src="/logo512.png" alt="Prakash Electronics" className="about-page-story-logo" />
            )}
          </div>
        </section>

        <AboutStoryShowcase />

        <section className="about-page-reasons">
          <div className="internal-page-section-head">
            <p className="internal-page-kicker">How we work</p>
            <h2>Service standards customers can rely on</h2>
            <p>Practical care at every stage, from diagnosis to delivery.</p>
          </div>
          <div className="about-page-reason-grid">
            {PAGE_PRINCIPLES.map((reason) => {
              const Icon = getIcon(reason.iconName, CheckCircle2);
              return (
                <article className="about-page-reason" key={reason.title}>
                  <span className="about-page-reason-icon"><Icon aria-hidden="true" /></span>
                  <h3>{reason.title}</h3>
                  <p>{reason.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="about-page-offerings">
          <div className="about-page-offerings-inner">
            <div>
              <p className="internal-page-kicker">What we provide</p>
              <h2>Products, parts, and repair support</h2>
              <p>From household electronics to useful electrical accessories, our team helps customers choose, maintain, and repair the right equipment.</p>
            </div>
            <ul>
              {PAGE_OFFERINGS.map((name) => (
                <li key={name}><CheckCircle2 aria-hidden="true" />{name}</li>
              ))}
            </ul>
          </div>
        </section>

        {stats.length ? (
          <section className="about-page-stats" aria-label="Prakash Electronics in numbers">
            {stats.map((stat, index) => (
              <div key={stat.label || index}>
                <strong>{stat.value}{stat.suffix || ""}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </section>
        ) : null}

        <FaqSection
          title="Questions customers often ask"
          description="Useful information before you choose a product or arrange a repair."
          items={ABOUT_FAQS}
        />

        <SocialChannels />

        <section className="about-page-cta">
          <p className="internal-page-kicker">Visit or contact us</p>
          <h2>Need help with a product or repair?</h2>
          <p>Speak directly with the Prakash Electronics team for the right next step.</p>
          <a className="internal-page-primary" href="/contact">Contact Prakash Electronics <ArrowRight size={17} aria-hidden="true" /></a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
