import { getWiringPartsPath, isWiringPartsPath, isLegacyWiringPartsPath } from './routes';

describe('wiring parts routes', () => {
  it('returns the canonical wiring parts path', () => {
    expect(getWiringPartsPath()).toBe('/wiring-parts');
  });

  it('recognizes the new canonical route', () => {
    expect(isWiringPartsPath('/wiring-parts')).toBe(true);
    expect(isWiringPartsPath('/wiring-parts/product-detail')).toBe(true);
  });

  it('recognizes legacy paths that should redirect', () => {
    expect(isLegacyWiringPartsPath('/projects-parts')).toBe(true);
    expect(isLegacyWiringPartsPath('/projects-parts/product-detail')).toBe(true);
  });
});
