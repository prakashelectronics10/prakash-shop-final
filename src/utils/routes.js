export const CANONICAL_WIRING_PARTS_PATH = '/wiring-parts';
export const LEGACY_WIRING_PARTS_PATH = '/projects-parts';

export function getWiringPartsPath() {
  return CANONICAL_WIRING_PARTS_PATH;
}

export function isWiringPartsPath(pathname = '') {
  return pathname === CANONICAL_WIRING_PARTS_PATH || pathname === `${CANONICAL_WIRING_PARTS_PATH}/product-detail`;
}

export function isLegacyWiringPartsPath(pathname = '') {
  return pathname === LEGACY_WIRING_PARTS_PATH || pathname === `${LEGACY_WIRING_PARTS_PATH}/product-detail`;
}
