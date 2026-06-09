import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { SiteDataProvider } from './context/SiteDataContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/site/Navbar';
import { Hero } from './components/site/Hero';
import { SectionFallback } from './components/site/SectionFallback';
import { CartFloatingButton } from './components/site/CartFloatingButton';

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

const routeMeta = [
  {
    match: (path) => path === '/science-ai',
    title: 'Science AI | Prakash Electronics Project Parts Assistant',
    description: 'Use Science AI from Prakash Electronics to identify electronics components, check available science project parts, and get project guidance in Chitarpur, Jharkhand.',
  },
  {
    match: (path) => path === '/products',
    title: 'Electronics Products and Parts in Chitarpur | Prakash Electronics',
    description: 'Browse available electronics products, science project components, accessories, and electrical parts from Prakash Electronics and Electricals in Chitarpur.',
  },
  {
    match: (path) => path === '/projects-parts',
    title: 'Science Project Parts in Chitarpur | Prakash Electronics',
    description: 'Buy available science project electronics parts including Arduino modules, sensors, motors, wires, and components from Prakash Electronics in Chitarpur.',
  },
  {
    match: (path) => path === '/booking',
    title: 'Book Electronics Repair in Chitarpur | Prakash Electronics',
    description: 'Book TV repair, fan repair, cooler repair, speaker repair, appliance repair, or electronics product requests with Prakash Electronics and Electricals.',
  },
  {
    match: (path) => path === '/cart',
    title: 'Cart | Prakash Electronics and Electricals',
    description: 'Review selected electronics products and science project parts before booking with Prakash Electronics and Electricals.',
  },
  {
    match: (path) => path.startsWith('/product-detail/'),
    title: 'Product Detail | Prakash Electronics and Electricals',
    description: 'View electronics product details, availability, price, and booking options at Prakash Electronics and Electricals.',
  },
  {
    match: (path) => path.startsWith('/admin'),
    title: 'Admin | Prakash Electronics',
    description: 'Prakash Electronics admin panel.',
    robots: 'noindex, nofollow',
  },
];

const defaultMeta = {
  title: 'Prakash Electronics and Electricals | Electronics Repair in Chitarpur',
  description: 'Prakash Electronics and Electricals, Chitarpur provides TV repair, fan repair, cooler repair, speaker repair, home appliance repair, electronics parts, electrical accessories, and doorstep service in Ramgarh, Jharkhand.',
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
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }

  document.title = meta.title;
  canonical.setAttribute('href', canonicalUrl);
  upsertMeta('meta[name="description"]', 'name', 'description', meta.description);
  upsertMeta('meta[name="robots"]', 'name', 'robots', meta.robots || defaultMeta.robots);
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
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
      { rootMargin: "360px 0px" },
    );

    const node = ref.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div id={anchorId} ref={ref} style={visible ? undefined : { minHeight }}>
      {visible ? children : null}
    </div>
  );
}

function App() {
  const params = new URLSearchParams(window.location.search);

  useEffect(() => {
    updateRouteMeta(window.location.pathname);
  }, []);

  if (
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/') ||
    window.location.pathname.startsWith('/admin-panel-prakash10')
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

  if (window.location.pathname === '/projects-parts' || params.get('page') === 'projects-parts') {
    return (
      <PublicShell>
        <LazyScreen>
          <ProjectsPartsPage />
        </LazyScreen>
      </PublicShell>
    );
  }

  if (window.location.pathname === '/projects-parts/product-detail' || params.get('page') === 'project-part-detail') {
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

  if (window.location.pathname === '/science-ai' || params.get('page') === 'science-ai') {
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
        <Suspense fallback={null}>
          <main>
            <DeferredSection anchorId="offers" minHeight={520}><Offers sectionId="" /></DeferredSection>
            <DeferredSection anchorId="services" minHeight={820}><Services sectionId="" /></DeferredSection>
            <DeferredSection anchorId="stats" minHeight={320}><Stats sectionId="" /></DeferredSection>
            <DeferredSection anchorId="testimonials" minHeight={540}><Testimonials sectionId="" /></DeferredSection>
            <DeferredSection minHeight={520}><QuickRouteCards /></DeferredSection>
            <DeferredSection anchorId="gallery" minHeight={940}><Gallery sectionId="" /></DeferredSection>
            <DeferredSection anchorId="featured-repairs" minHeight={720}><Carousel3D sectionId="" /></DeferredSection>
            <DeferredSection anchorId="about" minHeight={620}><About sectionId="" /></DeferredSection>
            <DeferredSection anchorId="contact" minHeight={820}><Contact sectionId="" /></DeferredSection>
          </main>
          <FloatingUI />
          <DeferredSection minHeight={360}><Footer /></DeferredSection>
        </Suspense>
      </div>
    </PublicShell>
  );
}

export default App;
