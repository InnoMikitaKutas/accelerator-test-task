import { deriveBrandVars, contrastRatio, CINDER } from './brand';

describe('deriveBrandVars (FR-037)', () => {
  it('uses white ink on a dark brand', () => {
    expect(deriveBrandVars('#1A73E8').brandInk).toBe('#FFFFFF');
  });

  it('uses dark ink on a light brand', () => {
    expect(deriveBrandVars('#FFE600').brandInk).toBe('#10141A');
  });

  it('darkens brand-text until it meets AA on a light surface', () => {
    // Pure yellow is ~1.07:1 on white — must be darkened substantially.
    const { brandText } = deriveBrandVars('#FFE600', '#FFFFFF');
    expect(contrastRatio(brandText, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps an already-AA brand-text meeting AA', () => {
    const { brandText } = deriveBrandVars('#0B5AAD', '#FFFFFF');
    expect(contrastRatio(brandText, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('lightens brand-text to meet AA on a dark surface', () => {
    const { brandText } = deriveBrandVars('#0B2E5A', '#161A21');
    expect(contrastRatio(brandText, '#161A21')).toBeGreaterThanOrEqual(4.5);
  });

  it('produces a 10% rgba tint from the raw channels', () => {
    expect(deriveBrandVars('#1A73E8').brandTint).toBe('rgba(26, 115, 232, 0.1)');
  });

  it('echoes brand and brand-line as the raw (normalized) color', () => {
    const v = deriveBrandVars('#1a73e8');
    expect(v.brand).toBe('#1A73E8');
    expect(v.brandLine).toBe('#1A73E8');
  });

  it('falls back to Cinder for invalid or non-6-digit hex', () => {
    expect(deriveBrandVars('nope')).toEqual(CINDER);
    expect(deriveBrandVars('#FFF')).toEqual(CINDER); // 3-digit not allowed by the DTO
    expect(deriveBrandVars('')).toEqual(CINDER);
  });
});
