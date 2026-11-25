export const CANONICAL_WIRING_PARTS_PATH = '/wiring-parts';
export const LEGACY_WIRING_PARTS_PATH = '/projects-parts';
const SITE_OG_IMAGES = {
  default: '/og-image.jpg',
  pulseAI: '/og-image-pulse-ai.jpg',
  products: '/og-image-shop-products.jpg?v=20260910-mobile',
  wiring: '/og-image-wiring.jpg',
};

export function getSiteOgImage(pathname) {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/pulse-ai' || path === '/science-ai') return SITE_OG_IMAGES.pulseAI;
  if (/^\/products(?:\/|$)/.test(path)) return SITE_OG_IMAGES.products;
  if (/^\/(?:wiring-parts|projects-parts)(?:\/|$)/.test(path)) return SITE_OG_IMAGES.wiring;
  return SITE_OG_IMAGES.default;
}

export function getWiringPartsPath() {
  return CANONICAL_WIRING_PARTS_PATH;
}

export function isWiringPartsPath(pathname = '') {
  return pathname === CANONICAL_WIRING_PARTS_PATH || pathname === `${CANONICAL_WIRING_PARTS_PATH}/product-detail`;
}

export function isLegacyWiringPartsPath(pathname = '') {
  return pathname === LEGACY_WIRING_PARTS_PATH || pathname === `${LEGACY_WIRING_PARTS_PATH}/product-detail`;
}
