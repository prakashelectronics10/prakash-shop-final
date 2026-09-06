import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSiteData } from "../../context/SiteDataContext";
import { CANONICAL_WIRING_PARTS_PATH } from "../../utils/routes";
import { usePageScroll } from "../../hooks/usePageScroll";
import { MenuVertical } from "../ui/MenuVertical";

const exactNavRoutes = {
  home: "/#home",
  offers: "/#offers",
  offer: "/#offers",
  services: "/#services",
  service: "/#services",
  gallery: "/gallery",
  "gallery page": "/gallery",
  photos: "/gallery",
  "photo gallery": "/gallery",
  testimonials: "/#testimonials",
  reviews: "/#testimonials",
  review: "/#testimonials",
  "featured repairs": "/#featured-repairs",
  repairs: "/#featured-repairs",
  stats: "/#trending",
  trending: "/#trending",
  "trending products": "/#trending",
  "top products": "/#top-products",
  top: "/#top-products",
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

function isCurrentRoute(href) {
  if (typeof window === "undefined") return false;
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  const currentHash = window.location.hash || "#home";
  const [pathPart, hashPart] = String(href || "").split("#");
  const targetPath = (pathPart || "/").replace(/\/$/, "") || "/";

  if (targetPath !== currentPath) return false;
  return hashPart ? currentHash === `#${hashPart}` : true;
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [, setLocationKey] = useState("");
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const { content } = useSiteData();
  const nav = content.navbar || {};
  const links = mergeRouteLinks(nav.links || []);
  const normalizedLinks = links.map((link) => ({
    ...link,
    href: normalizeNavHref(link),
    active: isCurrentRoute(normalizeNavHref(link)),
  }));
  const [brandFirst, ...brandRest] = String(nav.brandName || "").split(" ");
  const brandTail = brandRest.join(" ");

  usePageScroll(({ scrollY }) => {
    const next = scrollY > 30;
    setScrolled((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    const syncLocation = () => setLocationKey(`${window.location.pathname}${window.location.hash}`);
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        const drawerLinks = Array.from(drawerRef.current?.querySelectorAll("a[href]") || []);
        const focusable = [menuButtonRef.current, ...drawerLinks].filter(Boolean);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      drawerRef.current?.querySelector("a")?.focus();
    }, 180);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <header
      className={cn(
        "site-navbar-header fixed inset-x-0 top-0 z-50 py-4",
        open ? "is-menu-open" : "",
      )}
    >
      <div className="mx-auto max-w-7xl px-4">
        <nav
          className={cn(
            "site-navbar-shell relative z-20 flex items-center justify-between rounded-2xl px-4 py-3",
            scrolled ? "is-scrolled" : ""
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
              fetchpriority="high"
            />
            <span className="font-display text-lg font-bold tracking-tight">
              {brandFirst || "Prakash"} <span className="text-gradient">{brandTail || "Electronics"}</span>
            </span>
          </a>

          <ul className="hidden items-center gap-1 xl:flex">
            {normalizedLinks.map((l) => (
              <li
                key={`${l.label}-${l.href}`}
                className="p-1"
              >
                <a
                  href={l.href}
                  aria-current={l.active ? "page" : undefined}
                  className={cn(
                    "site-nav-link relative px-3 py-2 text-sm font-medium",
                    l.active ? "is-active" : ""
                  )}
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
            ref={menuButtonRef}
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-navigation-drawer"
            onClick={() => setOpen((o) => !o)}
            className="site-menu-toggle inline-flex h-11 w-11 items-center justify-center rounded-lg xl:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {open && (
            <div
              className="mobile-nav-overlay xl:hidden"
            >
              <button
                type="button"
                className="mobile-nav-backdrop"
                aria-label="Close navigation menu"
                tabIndex={-1}
                onClick={closeMenu}
              />
              <aside
                id="mobile-navigation-drawer"
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation"
                className="mobile-nav-drawer"
              >
                <div className="mobile-nav-drawer-head">
                  <span>Navigate</span>
                  <p>Prakash Electronics</p>
                </div>
                <MenuVertical menuItems={normalizedLinks} onNavigate={closeMenu} />
                <a onClick={closeMenu} href="/booking" className="mobile-nav-cta">
                  {nav.ctaLabel || "Book Repair"}
                </a>
              </aside>
            </div>
        )}
      </div>
    </header>
  );
}
