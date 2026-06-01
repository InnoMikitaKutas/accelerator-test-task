/**
 * Per-trainer theming contract (FR-037) — the central mechanism.
 *
 * Trainers pick an arbitrary `primaryColorHex`; we derive contrast-safe variants at
 * runtime so WCAG AA holds for ANY input:
 *  - brandInk  → white on a dark brand, near-black on a light brand (text ON a fill)
 *  - brandText → brand adjusted (darken on light surfaces / lighten on dark) until
 *                contrast vs the surface is ≥ 4.5:1 (brand text on a neutral surface)
 *  - brandTint → brand at 10% alpha
 *  - brand / brandLine → the raw color (fills, lane-indicator, ≥24px marks only)
 * Invalid/missing hex → platform "Cinder" fallback.
 */

export interface BrandVars {
  brand: string;
  brandText: string;
  brandInk: string;
  brandTint: string;
  brandLine: string;
}

/** Platform default — must match tokens.css :root. */
export const CINDER: BrandVars = {
  brand: '#E14817',
  brandText: '#BE3A10',
  brandInk: '#FFFFFF',
  brandTint: 'rgba(225, 72, 23, 0.1)',
  brandLine: '#E14817',
};

const HEX6 = /^#([0-9a-fA-F]{6})$/;
const AA_TEXT = 4.5;
const INK_DARK = '#10141A'; // near-black: dark text on a light brand fill

interface RGB {
  r: number;
  g: number;
  b: number;
}

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function parseHex(hex: string): RGB | null {
  const m = HEX6.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function roundRGB(rgb: RGB): RGB {
  return {
    r: Math.round(clamp(rgb.r, 0, 255)),
    g: Math.round(clamp(rgb.g, 0, 255)),
    b: Math.round(clamp(rgb.b, 0, 255)),
  };
}

function toHex(rgb: RGB): string {
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`.toUpperCase();
}

function channelLum(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminanceRGB(rgb: RGB): number {
  return 0.2126 * channelLum(rgb.r) + 0.7152 * channelLum(rgb.g) + 0.0722 * channelLum(rgb.b);
}

function ratioRGB(a: RGB, b: RGB): number {
  const la = luminanceRGB(a);
  const lb = luminanceRGB(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(rgb: RGB, target: RGB, t: number): RGB {
  return {
    r: rgb.r + (target.r - rgb.r) * t,
    g: rgb.g + (target.g - rgb.g) * t,
    b: rgb.b + (target.b - rgb.b) * t,
  };
}

/** Move the color toward black (on light surfaces) or white (on dark) until AA holds. */
function adjustForContrast(rgb: RGB, surface: RGB, target: number): RGB {
  const towards = luminanceRGB(surface) > 0.5 ? BLACK : WHITE;
  let best = roundRGB(rgb);
  for (let t = 0; t <= 1.0001; t += 0.04) {
    best = roundRGB(mix(rgb, towards, t));
    if (ratioRGB(best, surface) >= target) break;
  }
  return best;
}

/** WCAG relative luminance of a hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  return rgb ? luminanceRGB(rgb) : 0;
}

/** WCAG contrast ratio between two hex colors (1:1 … 21:1). */
export function contrastRatio(hex1: string, hex2: string): number {
  const a = parseHex(hex1) ?? BLACK;
  const b = parseHex(hex2) ?? WHITE;
  return ratioRGB(a, b);
}

export function deriveBrandVars(hex: string, surfaceHex = '#FFFFFF'): BrandVars {
  const rgb = parseHex(hex);
  if (!rgb) return CINDER;

  const surface = parseHex(surfaceHex) ?? WHITE;
  const brand = toHex(rgb);

  return {
    brand,
    brandLine: brand,
    brandInk: luminanceRGB(rgb) < 0.45 ? '#FFFFFF' : INK_DARK,
    brandText: toHex(adjustForContrast(rgb, surface, AA_TEXT)),
    brandTint: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
  };
}
