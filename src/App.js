import { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
const AdminApp = lazy(() => import('./admin/AdminApp'));
const Offers = lazy(() => import('./components/site/Offers').then((module) => ({ default: module.Offers })));
const Services = lazy(() => import('./components/site/Services').then((module) => ({ default: module.Services })));
const Stats = lazy(() => import('./components/site/Stats').then((module) => ({ default: module.Stats })));
const Testimonials = lazy(() => import('./components/site/Testimonials').then((module) => ({ default: module.Testimonials })));
const QuickRouteCards = lazy(() => import('./components/site/QuickRouteCards').then((module) => ({ default: module.QuickRouteCards })));
const Gallery = lazy(() => import('./components/site/Gallery').then((module) => ({ default: module.Gallery })));
const Carousel3D = lazy(() => import('./components/site/Carousel3D').then((module) => ({ default: module.Carousel3D })));
const About = lazy(() => import('./components/site/About').then((module) => ({ default: module.About })));
const Contact = lazy(() => import('./components/site/Contact').then((module) => ({ default: module.Contact })));
const FloatingUI = lazy(() => import('./components/site/FloatingUI').then((module) => ({ default: module.FloatingUI })));
const Footer = lazy(() => import('./components/site/Footer').then((module) => ({ default: module.Footer })));

const SITE_URL = 'https://www.prakashshop.in';
const ADMIN_ROUTE = '/prakash-control-panel@1999';

const routeMeta = [
  {
    match: (path) => path === '/pulse-ai' || path === '/science-ai',
    title: 'Pulse AI | Electronics Shop, Repair Guidance & Product Assistant',
    description: 'Pulse AI by Prakash Electronics helps you find electronics shop products, wiring accessories, RGB lights, cooler repairing, AC repairing, home appliances repairing, and booking guidance in Chitarpur, Jharkhand.',
    keywords: 'Pulse AI, electronics shop, home appliances repairing, cooler repairing, AC repairing, wiring accessories, RGB lights, repair assistant, Prakash Electronics',
    ogImage: `${SITE_URL}/og-image-pulse-ai.jpg`,
  },
  {
    match: (path) => path === '/products',
    title: 'Electronics Shop Products in Chitarpur | Prakash Electronics',
    description: 'Browse electronics shop products, wiring accessories, RGB lights, electrical parts, and accessories from Prakash Electronics and Electricals in Chitarpur.',
    keywords: 'electronics shop, wiring accessories, RGB lights, electrical accessories, electronics parts, shop products Chitarpur',
    ogImage: `${SITE_URL}/og-image-shop-products.jpg`,
  },
  {
    match: (path) => path === CANONICAL_WIRING_PARTS_PATH || path === '/projects-parts',
    title: 'Wiring Accessories in Chitarpur | Prakash Electronics',
    description: 'Buy wiring accessories, switches, sockets, wires, MCBs, and electrical fittings by category and brand from Prakash Electronics in Chitarpur.',
    keywords: 'wiring accessories, switches, sockets, electrical fittings, MCB, wiring products Chitarpur',
    ogImage: `${SITE_URL}/og-image-wiring.jpg`,
  },
  {
    match: (path) => path === '/booking',
    title: 'Book Electronics Repair in Chitarpur | Prakash Electronics',
    description: 'Book TV repair, fan repair, cooler repairing, AC repairing, speaker repair, home appliances repairing, or electronics product requests with Prakash Electronics and Electricals.',
    keywords: 'home appliances repairing, cooler repairing, AC repairing, TV repair, fan repair, book repair Chitarpur',
  },
  {
    match: (path) => path === '/cart',
    title: 'Cart | Prakash Electronics and Electricals',
    description: 'Review selected electronics products and wiring accessories before booking with Prakash Electronics and Electricals.',
    keywords: 'electronics shop cart, wiring accessories, electronics parts',
  },
  {
    match: (path) => path.startsWith('/product-detail/'),
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

function updateRouteMeta(pathname) {
  const meta = routeMeta.find((item) => item.match(pathname)) || defaultMeta;
  const canonicalPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const canonicalUrl = `${SITE_URL}${canonicalPath === '/science-ai' ? '/pulse-ai' : canonicalPath}`;
  const keywords = meta.keywords || defaultMeta.keywords;
  const ogImage = meta.ogImage || `${SITE_URL}/og-image.jpg`;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }

  document.title = meta.title;
  canonical.setAttribute('href', canonicalUrl);
  upsertMeta('meta[name="description"]', 'name', 'description', meta.description);
  upsertMeta('meta[name="keywords"]', 'name', 'keywords', keywords);
  upsertMeta('meta[name="robots"]', 'name', 'robots', meta.robots || defaultMeta.robots);
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
  upsertMeta('meta[property="og:image"]', 'property', 'og:image', ogImage);
  upsertMeta('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', ogImage);
  upsertMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', meta.title);
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage);
}

function LazyScreen({ children }) {
  return <Suspense fallback={<SectionFallback />}>{children}</Suspense>;
}

function PublicShell({ children, siteData = true }) {
  const content = (
    <CartProvider>
      {children}
      <CartFloatingButton />
    </CartProvider>
  );

  return siteData ? <SiteDataProvider>{content}</SiteDataProvider> : content;
}

function DeferredSection({ children, minHeight = 600, anchorId }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "180px 0px" },
    );

    const node = ref.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  // Keep a stable minHeight so lazy/Suspense loading never collapses document
  // height (that collapse was clamping scrollY and jumping the page upward).
  return (
    <div
      id={anchorId}
      ref={ref}
      className="deferred-section"
      style={{ minHeight }}
    >
      {visible ? (
        <Suspense fallback={<div style={{ minHeight }} aria-hidden="true" />}>
          {children}
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
    if (
      pathname === '/science-ai'
      || params.get('page') === 'science-ai'
    ) {
      window.history.replaceState({}, '', '/pulse-ai');
      updateRouteMeta('/pulse-ai');
      return;
    }

    if (isLegacyWiringPartsPath(pathname) || params.get('page') === 'projects-parts') {
      window.history.replaceState({}, '', getWiringPartsPath());
      updateRouteMeta(CANONICAL_WIRING_PARTS_PATH);
      return;
    }

    updateRouteMeta(pathname);
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

  if (window.location.pathname === '/cart' || params.get('page') === 'cart') {
    return (
      <PublicShell>
        <LazyScreen>
          <CartPage />
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

  if (window.location.pathname.startsWith('/product-detail/')) {
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
      <PublicShell siteData={false}>
        <LazyScreen>
          <ScienceAIPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="App">
        <Navbar />
        <Hero />
        <main>
          <DeferredSection anchorId="offers" minHeight={880}><Offers sectionId="" /></DeferredSection>
          <DeferredSection anchorId="services" minHeight={980}><Services sectionId="" /></DeferredSection>
          <DeferredSection anchorId="stats" minHeight={320}><Stats sectionId="" /></DeferredSection>
          <DeferredSection anchorId="testimonials" minHeight={540}><Testimonials sectionId="" /></DeferredSection>
          <DeferredSection minHeight={520}><QuickRouteCards /></DeferredSection>
          <DeferredSection anchorId="gallery" minHeight={940}><Gallery sectionId="" /></DeferredSection>
          <DeferredSection anchorId="featured-repairs" minHeight={720}><Carousel3D sectionId="" /></DeferredSection>
          <DeferredSection anchorId="about" minHeight={760}><About sectionId="" /></DeferredSection>
          <DeferredSection anchorId="contact" minHeight={820}><Contact sectionId="" /></DeferredSection>
        </main>
        <Suspense fallback={null}>
          <FloatingUI />
        </Suspense>
        <DeferredSection minHeight={360}><Footer /></DeferredSection>
      </div>
    </PublicShell>
  );
}

export default App;
