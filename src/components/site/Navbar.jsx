import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSiteData } from "../../context/SiteDataContext";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";

const exactNavRoutes = {
  home: "/#home",
  offers: "/#offers",
  offer: "/#offers",
  services: "/#services",
  service: "/#services",
  gallery: "/#gallery",
  testimonials: "/#testimonials",
  reviews: "/#testimonials",
  review: "/#testimonials",
  "featured repairs": "/#featured-repairs",
  repairs: "/#featured-repairs",
  stats: "/#stats",
  about: "/#about",
  "about us": "/#about",
  contact: "/#contact",
  "contact us": "/#contact",
  booking: "/booking",
  "book repair": "/booking",
  products: "/products",
  product: "/products",
  shop: "/products",
  "shop products": "/products",
  "project parts": CANONICAL_WIRING_PARTS_PATH,
  "projects parts": CANONICAL_WIRING_PARTS_PATH,
  "science project parts": CANONICAL_WIRING_PARTS_PATH,
  "wiring accessories": CANONICAL_WIRING_PARTS_PATH,
  wiring: CANONICAL_WIRING_PARTS_PATH,
  components: CANONICAL_WIRING_PARTS_PATH,
  "science ai": "/pulse-ai",
  "pulse ai": "/pulse-ai",
  ai: "/pulse-ai",
};

const primaryRouteLinks = [
  { href: "/products", label: "Products" },
  { href: CANONICAL_WIRING_PARTS_PATH, label: "Wiring Accessories" }
];

function normalizeNavHref(link = {}) {
  const labelKey = String(link.label || "").trim().toLowerCase();
  const rawHref = String(link.href || "").trim();
  const hrefKey = rawHref.replace(/^\/?#/, "").replace(/-/g, " ").toLowerCase();

  if (exactNavRoutes[labelKey]) return exactNavRoutes[labelKey];
  if (exactNavRoutes[hrefKey]) return exactNavRoutes[hrefKey];
  if (!rawHref) return "/#home";
  if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(rawHref)) return rawHref;
  if (rawHref.startsWith("#")) return `/${rawHref}`;
  if (rawHref.startsWith("/#")) return rawHref;
  if (rawHref.startsWith("/")) return rawHref;
  return `/#${rawHref.replace(/^#/, "")}`;
}

function mergeRouteLinks(links = []) {
  const seen = new Set(
    links.map((link) => normalizeNavHref(link).replace(/\/$/, "").toLowerCase()),
  );

  const merged = [...links];
  primaryRouteLinks.forEach((link) => {
    const href = normalizeNavHref(link).replace(/\/$/, "").toLowerCase();
    if (!seen.has(href)) {
      merged.push(link);
      seen.add(href);
    }
  });

  return merged;
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { content } = useSiteData();
  const nav = content.navbar || {};
  const links = mergeRouteLinks(nav.links || []);
  const [brandFirst, ...brandRest] = String(nav.brandName || "").split(" ");
  const brandTail = brandRest.join(" ");

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const next = window.scrollY > 30;
        setScrolled((prev) => (prev === next ? prev : next));
        frame = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 py-4"
      )}
    >
      <div className="mx-auto max-w-7xl px-4">
        <nav
          className={cn(
            "flex items-center justify-between rounded-2xl px-4 py-3 transition-colors duration-200 ease-out",
            scrolled ? "glass-strong shadow-elegant" : "glass"
          )}
        >
          <a href="/#home" className="flex items-center gap-2">
            <img 
              src="/logo192.png" 
              alt="Prakash Electronics logo" 
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl shadow-glow"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <span className="font-display text-lg font-bold tracking-tight">
              {brandFirst || "Prakash"} <span className="text-gradient">{brandTail || "Electronics"}</span>
            </span>
          </a>

          <ul className="hidden items-center gap-1 xl:flex">
            {links.map((l) => (
              <li key={`${l.label}-${l.href}`} className="bg-[rgba(17,62,125,0.43)] p-1 rounded-3xl border border-[#9487875a] hover:border-blue-500">
                <a
                  href={normalizeNavHref(l)}
                  className="relative rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden xl:block">
            <a
              href="/booking"
              className="group relative inline-flex items-center justify-center rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform duration-300 hover:scale-105"
            >
              {nav.ctaLabel || "Book Repair"}
            </a>
          </div>

          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground xl:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {open && (
          <div className="mt-2 rounded-2xl glass-strong p-4 xl:hidden animate-fade-up">
            <ul className="flex flex-col gap-1">
              {links.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  <a
                    onClick={() => setOpen(false)}
                    href={normalizeNavHref(l)}
                    className="block rounded-lg px-4 py-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="pt-2">
                <a
                  onClick={() => setOpen(false)}
                  href="/booking"
                  className="block rounded-xl bg-gradient-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground shadow-glow"
                >
                  {nav.ctaLabel || "Book Repair"}
                </a>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}
