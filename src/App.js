import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { SiteDataProvider } from './context/SiteDataContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/site/Navbar';
import { Hero } from './components/site/Hero';
import { SectionFallback } from './components/site/SectionFallback';
import { CartFloatingButton } from './components/site/CartFloatingButton';
import { CANONICAL_WIRING_PARTS_PATH, getWiringPartsPath, isLegacyWiringPartsPath } from './utils/routes';

const LearnMore = lazy(() => import('./components/site/LearnMore').then((module) => ({ default: module.LearnMore })));
const Booking = lazy(() => import('./components/site/Booking').then((module) => ({ default: module.Booking })));
const ProjectsPartsPage = lazy(() => import('./components/site/ProjectsPartsPage').then((module) => ({ default: module.ProjectsPartsPage })));
const ProjectPartDetailPage = lazy(() => import('./components/site/ProjectsPartsPage').then((module) => ({ default: module.ProjectPartDetailPage })));
const ScienceAIPage = lazy(() => import('./components/site/ScienceAIPage').then((module) => ({ default: module.ScienceAIPage })));
const ShopProductsPage = lazy(() => import('./components/site/ShopProductsPage').then((module) => ({ default: module.ShopProductsPage })));
const ProductDetailPage = lazy(() => import('./components/site/ShopProductsPage').then((module) => ({ default: module.ProductDetailPage })));
const CartPage = lazy(() => import('./components/site/CartPage').then((module) => ({ default: module.CartPage })));
const CheckoutPage = lazy(() => import('./components/site/CheckoutPage').then((module) => ({ default: module.CheckoutPage })));
const OrderTrackingPage = lazy(() => import('./components/site/OrderTrackingPage').then((module) => ({ default: module.OrderTrackingPage })));
const AdminApp = lazy(() => import('./admin/AdminApp'));
const Offers = lazy(() => import('./components/site/Offers').then((module) => ({ default: module.Offers })));
const ShopHighlights = lazy(() => import('./components/site/ShopHighlights').then((module) => ({ default: module.ShopHighlights })));
const Services = lazy(() => import('./components/site/Services').then((module) => ({ default: module.Services })));
const TrendingProducts = lazy(() => import('./components/site/TrendingProducts').then((module) => ({ default: module.TrendingProducts })));
const TopProducts = lazy(() => import('./components/site/TopProducts').then((module) => ({ default: module.TopProducts })));
const Testimonials = lazy(() => import('./components/site/Testimonials').then((module) => ({ default: module.Testimonials })));
const QuickRouteCards = lazy(() => import('./components/site/QuickRouteCards').then((module) => ({ default: module.QuickRouteCards })));
const Gallery = lazy(() => import('./components/site/Gallery').then((module) => ({ default: module.Gallery })));
const GalleryPage = lazy(() => import('./components/site/GalleryPage').then((module) => ({ default: module.GalleryPage })));
const Carousel3D = lazy(() => import('./components/site/Carousel3D').then((module) => ({ default: module.Carousel3D })));
const About = lazy(() => import('./components/site/About').then((module) => ({ default: module.About })));
const Contact = lazy(() => import('./components/site/Contact').then((module) => ({ default: module.Contact })));
const FloatingUI = lazy(() => import('./components/site/FloatingUI').then((module) => ({ default: module.FloatingUI })));
const Footer = lazy(() => import('./components/site/Footer').then((module) => ({ default: module.Footer })));
const BrandsMarquee = lazy(() => import('./components/site/BrandsMarquee').then((module) => ({ default: module.BrandsMarquee })));
const AboutPage = lazy(() => import('./components/site/AboutPage').then((module) => ({ default: module.AboutPage })));
const ContactPage = lazy(() => import('./components/site/ContactPage').then((module) => ({ default: module.ContactPage })));
const PrivacyPolicyPage = lazy(() => import('./components/site/LegalPages').then((module) => ({ default: module.PrivacyPolicyPage })));
const TermsConditionsPage = lazy(() => import('./components/site/LegalPages').then((module) => ({ default: module.TermsConditionsPage })));
const ShippingPolicyPage = lazy(() => import('./components/site/LegalPages').then((module) => ({ default: module.ShippingPolicyPage })));
const ReturnRefundPolicyPage = lazy(() => import('./components/site/LegalPages').then((module) => ({ default: module.ReturnRefundPolicyPage })));

const SITE_URL = 'https://prakashshop.in';
const ADMIN_ROUTE = '/prakash-control-panel@1999';
const LEGACY_PAGE_ROUTES = {
  'learn-more': '/learn-more',
  booking: '/booking',
  gallery: '/gallery',
  about: '/about',
  contact: '/contact',
  products: '/products',
  'projects-parts': CANONICAL_WIRING_PARTS_PATH,
  'pulse-ai': '/pulse-ai',
  'science-ai': '/pulse-ai',
  cart: '/cart',
};

const routeMeta = [
  {
    match: (path) => path === '/pulse-ai' || path === '/science-ai',
    title: 'Pulse AI by Prakash Electronics | Prakash Electronics and Electricals',
    description: 'Pulse AI helps you find suitable electronics products, wiring accessories, repair guidance, offers, and service-booking options from Prakash Electronics.',
    keywords: 'Pulse AI, electronics shop, home appliances repairing, cooler repairing, AC repairing, wiring accessories, RGB lights, repair assistant, Prakash Electronics',
    ogImage: `${SITE_URL}/og-image-pulse-ai.jpg`,
    ogImageAlt: 'Pulse AI by Prakash Electronics',
  },
  {
    match: (path) => path === '/products' || path.startsWith('/products/'),
    title: 'Electronics Shop Products in Chitarpur | Prakash Electronics',
    description: 'Browse electronics shop products, wiring accessories, RGB lights, electrical parts, and accessories from Prakash Electronics and Electricals in Chitarpur.',
    keywords: 'electronics shop, wiring accessories, RGB lights, electrical accessories, electronics parts, shop products Chitarpur',
    ogImage: `${SITE_URL}/og-image-shop-products.png`,
    ogImageAlt: 'Prakash Electronics shop products',
    ogImageType: 'image/png',
    ogImageWidth: 1672,
    ogImageHeight: 941,
  },
  {
    match: (path) => path === CANONICAL_WIRING_PARTS_PATH || path === '/projects-parts' || path.startsWith(`${CANONICAL_WIRING_PARTS_PATH}/`) || path.startsWith('/projects-parts/'),
    title: 'Wiring Accessories in Chitarpur | Prakash Electronics',
    description: 'Buy wiring accessories, switches, sockets, wires, MCBs, and electrical fittings by category and brand from Prakash Electronics in Chitarpur.',
    keywords: 'wiring accessories, switches, sockets, electrical fittings, MCB, wiring products Chitarpur',
    ogImage: `${SITE_URL}/og-image-wiring.jpg`,
    ogImageAlt: 'Prakash Electronics wiring accessories',
  },
  {
    match: (path) => path === '/booking',
    title: 'Book Electronics Repair in Chitarpur | Prakash Electronics',
    description: 'Book TV repair, fan repair, cooler repairing, AC repairing, speaker repair, home appliances repairing, or electronics product requests with Prakash Electronics and Electricals.',
    keywords: 'home appliances repairing, cooler repairing, AC repairing, TV repair, fan repair, book repair Chitarpur',
  },
  {
    match: (path) => path === '/gallery',
    title: 'Gallery | Prakash Electronics and Electricals Chitarpur',
    description: 'Browse workshop photos, repair work, electronics products, and shop moments from Prakash Electronics and Electricals in Chitarpur, Ramgarh.',
    keywords: 'Prakash Electronics gallery, repair photos, electronics shop gallery Chitarpur, workshop photos',
  },
  {
    match: (path) => path === '/about',
    title: 'About Prakash Electronics | Trusted Since 2000',
    description: 'Learn about Prakash Electronics and Electricals, serving Chitarpur with electronics sales, practical diagnostics, genuine parts, and dependable repair service since 2000.',
    keywords: 'about Prakash Electronics, electronics repair Chitarpur, electronics shop since 2000, appliance repair Ramgarh',
  },
  {
    match: (path) => path === '/contact',
    title: 'Contact Prakash Electronics | Chitarpur, Jharkhand',
    description: 'Call, WhatsApp, email, or visit Prakash Electronics and Electricals in Chitarpur for electronics products, wiring accessories, and repair support.',
    keywords: 'contact Prakash Electronics, electronics shop Chitarpur, repair contact Ramgarh, WhatsApp electronics repair',
  },
  {
    match: (path) => path === '/privacy-policy',
    title: 'Privacy Policy | Prakash Electronics',
    description: 'Read how Prakash Electronics collects, uses, protects, and manages information for orders, repair bookings, payments, and website services.',
    keywords: 'Prakash Electronics privacy policy, customer data, order privacy, Razorpay payment privacy',
  },
  {
    match: (path) => path === '/terms-and-conditions',
    title: 'Terms & Conditions | Prakash Electronics',
    description: 'Read the terms for using the Prakash Electronics website, ordering products, making payments, arranging delivery, and booking repairs.',
    keywords: 'Prakash Electronics terms and conditions, product order terms, repair booking terms, delivery terms',
  },
  {
    match: (path) => path === '/shipping-policy',
    title: 'Shipping Policy | Prakash Electronics',
    description: 'Read delivery areas, charges, tracking, delivery attempts, and failed-delivery refund information for Prakash Electronics orders.',
    keywords: 'Prakash Electronics shipping policy, delivery policy, order tracking',
  },
  {
    match: (path) => path === '/return-refund-policy',
    title: 'Return & Refund Policy | Prakash Electronics',
    description: 'Read cancellation eligibility and refund timelines for paid Prakash Electronics product orders.',
    keywords: 'Prakash Electronics refund policy, cancellation policy, return policy',
  },
  {
    match: (path) => path === '/learn-more',
    title: 'Electronics Repair Services | Prakash Electronics Chitarpur',
    description: 'Explore electronics and home-appliance repair services from Prakash Electronics in Chitarpur, including TV, fan, cooler, AC, and speaker repairs.',
    keywords: 'electronics repair services Chitarpur, TV repair, fan repair, cooler repair, AC repair, speaker repair',
  },
  {
    match: (path) => path === '/cart',
    title: 'Cart | Prakash Electronics and Electricals',
    description: 'Review selected electronics products and wiring accessories before booking with Prakash Electronics and Electricals.',
    keywords: 'electronics shop cart, wiring accessories, electronics parts',
    robots: 'noindex, nofollow',
  },
  {
    match: (path) => path === '/checkout',
    title: 'Secure Checkout | Prakash Electronics',
    description: 'Complete delivery details and pay securely for your Prakash Electronics order.',
    keywords: 'Prakash Electronics checkout, secure Razorpay payment',
    robots: 'noindex, nofollow',
  },
  {
    match: (path) => path === '/orders',
    title: 'Track Order | Prakash Electronics',
    description: 'Track a Prakash Electronics order using your secure Order ID.',
    keywords: 'track order, Prakash Electronics order status',
    robots: 'noindex, nofollow',
  },
  {
    match: (path) => path.startsWith('/product/') || path.startsWith('/product-detail/'),
    title: 'Product Detail | Prakash Electronics and Electricals',
    description: 'View electronics product details, availability, price, and booking options at Prakash Electronics and Electricals.',
    keywords: 'electronics shop, product detail, wiring accessories, electrical accessories',
  },
  {
    match: (path) => path.startsWith(ADMIN_ROUTE),
    title: 'Admin | Prakash Electronics',
    description: 'Prakash Electronics admin panel.',
    robots: 'noindex, nofollow',
  },
];

const defaultMeta = {
  title: 'Prakash Electronics and Electricals | Electronics Repair in Chitarpur',
  description: 'Prakash Electronics and Electricals, Chitarpur provides electronics shop products, home appliance repair, cooler repair, AC repair, wiring accessories, and dependable electrical service in Ramgarh, Jharkhand.',
  keywords: 'electronics shop, home appliances repairing, cooler repairing, AC repairing, wiring accessories, electrical accessories, TV repair, fan repair, electronics parts, shop in Chitarpur',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
};

function upsertMeta(selector, attributeName, attributeValue, content) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function updateAmpHtmlLink(pathname) {
  const cleanPath = String(pathname || '/').replace(/\/+$/, '') || '/';
  const productMatch = cleanPath.match(/^\/(?:product|product-detail)\/([^/?#]+)/i);
  let productIdentifier = '';
  if (productMatch) {
    try {
      productIdentifier = encodeURIComponent(decodeURIComponent(productMatch[1]));
    } catch (_error) {
      productIdentifier = encodeURIComponent(productMatch[1]);
    }
  }
  const ampPath = productMatch
    ? `/amp/product/${productIdentifier}`
    : cleanPath === '/products'
      ? '/amp/products'
      : cleanPath === CANONICAL_WIRING_PARTS_PATH
        ? '/amp/wiring-parts'
        : '';
  let ampLink = document.head.querySelector('link[rel="amphtml"]');
  if (!ampPath) {
    ampLink?.remove();
    return;
  }
  if (!ampLink) {
    ampLink = document.createElement('link');
    ampLink.setAttribute('rel', 'amphtml');
    document.head.appendChild(ampLink);
  }
  ampLink.setAttribute('href', `${SITE_URL}${ampPath}`);
}

function updateRouteMeta(pathname, search = '') {
  const normalizedPath = pathname === '/science-ai' ? '/pulse-ai' : pathname;
  const meta = routeMeta.find((item) => item.match(normalizedPath)) || defaultMeta;
  const canonicalPath = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/$/, '');
  const searchParams = new URLSearchParams(search);
  const service = canonicalPath === '/learn-more' ? String(searchParams.get('service') || '').trim() : '';
  const canonicalUrl = `${SITE_URL}${canonicalPath}${service ? `?service=${encodeURIComponent(service)}` : ''}`;
  const keywords = meta.keywords || defaultMeta.keywords;
  const ogImage = meta.ogImage || `${SITE_URL}/og-image.jpg`;
  const ogImageAlt = meta.ogImageAlt || meta.title;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }

  document.title = meta.title;
  canonical.setAttribute('href', canonicalUrl);
  updateAmpHtmlLink(pathname);
  upsertMeta('meta[name="description"]', 'name', 'description', meta.description);
  upsertMeta('meta[name="keywords"]', 'name', 'keywords', keywords);
  upsertMeta('meta[name="robots"]', 'name', 'robots', meta.robots || defaultMeta.robots);
  upsertMeta('meta[name="googlebot"]', 'name', 'googlebot', meta.robots || defaultMeta.robots);
  upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
  upsertMeta('meta[property="og:image"]', 'property', 'og:image', ogImage);
  upsertMeta('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', ogImage);
  upsertMeta('meta[property="og:image:type"]', 'property', 'og:image:type', meta.ogImageType || 'image/jpeg');
  upsertMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', ogImageAlt);
  upsertMeta('meta[property="og:image:width"]', 'property', 'og:image:width', String(meta.ogImageWidth || 1200));
  upsertMeta('meta[property="og:image:height"]', 'property', 'og:image:height', String(meta.ogImageHeight || 630));
  upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage);
  upsertMeta('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', ogImageAlt);
  document.documentElement.dataset.routeOgImage = meta.ogImage ? '1' : '';
}

function LazyScreen({ children }) {
  return <Suspense fallback={<SectionFallback />}>{children}</Suspense>;
}

function NotFoundPage() {
  return (
    <PublicShell>
      <div className="App min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-20 text-center">
          <section>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">404 · Page not found</p>
            <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">This page is not available</h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">The link may be outdated. Continue to the shop or return to the homepage.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a className="rounded-xl bg-gradient-primary px-6 py-3 font-semibold text-primary-foreground" href="/">Go to homepage</a>
              <a className="rounded-xl border border-border px-6 py-3 font-semibold" href="/products">Browse products</a>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </PublicShell>
  );
}

function PublicShell({ children, siteData = true, showFloatingActions = true }) {
  useEffect(() => {
    document.body.classList.add('public-light-theme');
    return () => document.body.classList.remove('public-light-theme');
  }, []);

  const content = (
    <CartProvider>
      {children}
      {showFloatingActions ? (
        <Suspense fallback={null}>
          <FloatingUI />
        </Suspense>
      ) : null}
      {showFloatingActions ? <CartFloatingButton /> : null}
    </CartProvider>
  );

  const themedContent = <div className="public-site-theme">{content}</div>;
  return siteData ? <SiteDataProvider>{themedContent}</SiteDataProvider> : themedContent;
}

function DeferredSectionReady({ onReady, children }) {
  useEffect(() => {
    let frame = 0;
    let timer = 0;
    frame = window.requestAnimationFrame(() => {
      // Drop placeholder minHeight after the section has painted.
      timer = window.setTimeout(onReady, 40);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [onReady]);

  return children;
}

/** Serializes DeferredSection mounts on desktop; mobile mounts in parallel for fling scroll. */
const deferredMountQueue = [];
let deferredMountBusy = false;
const DEFERRED_STAGGER_DESKTOP_MS = 90;

function getDeferredStaggerMs() {
  if (typeof window === "undefined") return DEFERRED_STAGGER_DESKTOP_MS;
  return window.matchMedia("(max-width: 768px)").matches ? 0 : DEFERRED_STAGGER_DESKTOP_MS;
}

function enqueueDeferredMount(activate) {
  deferredMountQueue.push(activate);
  drainDeferredMountQueue();
}

function drainDeferredMountQueue() {
  if (deferredMountBusy) return;
  const next = deferredMountQueue.shift();
  if (!next) return;
  deferredMountBusy = true;
  next();
  const stagger = getDeferredStaggerMs();
  if (stagger <= 0) {
    deferredMountBusy = false;
    drainDeferredMountQueue();
    return;
  }
  window.setTimeout(() => {
    deferredMountBusy = false;
    drainDeferredMountQueue();
  }, stagger);
}

function DeferredSection({ children, minHeight = 420, anchorId, eager = false }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(eager);
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    if (!("IntersectionObserver" in window)) {
      enqueueDeferredMount(() => setVisible(true));
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        enqueueDeferredMount(() => setVisible(true));
      },
      // Prefetch ~1 viewport ahead so fling scroll does not hit empty shells.
      { rootMargin: "800px 0px" },
    );

    const node = ref.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const markReady = useCallback(() => {
    setContentReady(true);
  }, []);

  // Placeholder height only while waiting / loading — aligned with contain-intrinsic-size.
  return (
    <div
      id={anchorId}
      ref={ref}
      className={`deferred-section${contentReady ? " is-ready" : ""}`}
      style={contentReady ? undefined : { minHeight }}
    >
      {visible ? (
        <Suspense fallback={<div style={{ minHeight: Math.min(minHeight, 280) }} aria-hidden="true" />}>
          <DeferredSectionReady onReady={markReady}>
            {children}
          </DeferredSectionReady>
        </Suspense>
      ) : null}
    </div>
  );
}

function App() {
  const search = window.location.search;

  useEffect(() => {
    const params = new URLSearchParams(search);
    const pathname = window.location.pathname;
    const legacyPage = String(params.get('page') || '').trim().toLowerCase();
    const legacyDestination = pathname === '/' ? LEGACY_PAGE_ROUTES[legacyPage] : '';
    if (legacyDestination) {
      const service = legacyPage === 'learn-more' ? String(params.get('service') || '').trim() : '';
      const nextSearch = service ? `?service=${encodeURIComponent(service)}` : '';
      window.history.replaceState({}, '', `${legacyDestination}${nextSearch}`);
      updateRouteMeta(legacyDestination, nextSearch);
      return;
    }
    if (
      pathname === '/science-ai'
      || params.get('page') === 'science-ai'
    ) {
      window.history.replaceState({}, '', '/pulse-ai');
      updateRouteMeta('/pulse-ai', '');
      return;
    }

    if (isLegacyWiringPartsPath(pathname) || params.get('page') === 'projects-parts') {
      window.history.replaceState({}, '', getWiringPartsPath());
      updateRouteMeta(CANONICAL_WIRING_PARTS_PATH, '');
      return;
    }

    updateRouteMeta(pathname, search);
  }, [search]);

  const params = new URLSearchParams(search);

  if (
    window.location.pathname === ADMIN_ROUTE ||
    window.location.pathname.startsWith(`${ADMIN_ROUTE}/`)
  ) {
    return (
      <LazyScreen>
        <AdminApp />
      </LazyScreen>
    );
  }

  if (window.location.pathname === '/learn-more' || params.get('page') === 'learn-more') {
    return (
      <PublicShell>
        <LazyScreen>
          <LearnMore />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/booking' || params.get('page') === 'booking') {
    return (
      <PublicShell>
        <LazyScreen>
          <Booking />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/gallery' || params.get('page') === 'gallery') {
    return (
      <PublicShell>
        <LazyScreen>
          <GalleryPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/about' || params.get('page') === 'about') {
    return (
      <PublicShell>
        <LazyScreen>
          <AboutPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/contact' || params.get('page') === 'contact') {
    return (
      <PublicShell>
        <LazyScreen>
          <ContactPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/privacy-policy') {
    return (
      <PublicShell>
        <LazyScreen>
          <PrivacyPolicyPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/terms-and-conditions') {
    return (
      <PublicShell>
        <LazyScreen>
          <TermsConditionsPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/shipping-policy') {
    return (
      <PublicShell>
        <LazyScreen><ShippingPolicyPage /></LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/return-refund-policy') {
    return (
      <PublicShell>
        <LazyScreen><ReturnRefundPolicyPage /></LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/cart' || params.get('page') === 'cart') {
    return (
      <PublicShell>
        <LazyScreen>
          <CartPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/checkout') {
    return (
      <PublicShell>
        <LazyScreen>
          <CheckoutPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/orders') {
    return (
      <PublicShell>
        <LazyScreen>
          <OrderTrackingPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === CANONICAL_WIRING_PARTS_PATH || params.get('page') === 'projects-parts') {
    return (
      <PublicShell>
        <LazyScreen>
          <ProjectsPartsPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === `${CANONICAL_WIRING_PARTS_PATH}/product-detail` || params.get('page') === 'project-part-detail') {
    return (
      <PublicShell>
        <LazyScreen>
          <ProjectPartDetailPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname.startsWith('/product/') || window.location.pathname.startsWith('/product-detail/')) {
    return (
      <PublicShell>
        <LazyScreen>
          <ProductDetailPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/products' || params.get('page') === 'products') {
    return (
      <PublicShell>
        <LazyScreen>
          <ShopProductsPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (
    window.location.pathname === '/pulse-ai'
    || window.location.pathname === '/science-ai'
    || params.get('page') === 'pulse-ai'
    || params.get('page') === 'science-ai'
  ) {
    return (
      <PublicShell siteData={false} showFloatingActions={false}>
        <LazyScreen>
          <ScienceAIPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname !== '/') {
    return <NotFoundPage />;
  }

  return (
    <PublicShell>
      <div className="App">
        <Navbar />
        <Hero />
        <Suspense fallback={null}>
          <BrandsMarquee />
        </Suspense>
        <main>
          <DeferredSection eager anchorId="offers" minHeight={420}><Offers sectionId="" /></DeferredSection>
          <DeferredSection eager anchorId="shop-highlights" minHeight={420}><ShopHighlights sectionId="" /></DeferredSection>
          <DeferredSection eager anchorId="services" minHeight={420}><Services sectionId="" /></DeferredSection>
          <DeferredSection anchorId="trending" minHeight={320}><TrendingProducts sectionId="" /></DeferredSection>
          <DeferredSection anchorId="top-products" minHeight={320}><TopProducts sectionId="" /></DeferredSection>
          <DeferredSection minHeight={280}><QuickRouteCards /></DeferredSection>
          <DeferredSection anchorId="gallery" minHeight={420}><Gallery sectionId="" /></DeferredSection>
          <DeferredSection anchorId="featured-repairs" minHeight={420}><Carousel3D sectionId="" /></DeferredSection>
          <DeferredSection anchorId="about" minHeight={420}><About sectionId="" /></DeferredSection>
          <DeferredSection anchorId="testimonials" minHeight={420}><Testimonials sectionId="" /></DeferredSection>
          <DeferredSection anchorId="contact" minHeight={420}><Contact sectionId="" /></DeferredSection>
        </main>
        <DeferredSection minHeight={280}><Footer /></DeferredSection>
      </div>
    </PublicShell>
  );
}

export default App;
