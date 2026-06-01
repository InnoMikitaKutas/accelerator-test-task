import createDOMPurify, { type DOMPurify } from 'dompurify';

/**
 * Server-side SVG sanitizer (FR-037/§13 — stored-XSS defense). DOMPurify needs a DOM window:
 * in a real Node process we build one lazily with jsdom; under Jest (jsdom test environment) we
 * reuse the global `window`, which lets the unit tests run without ts-jest transforming jsdom's
 * ESM dependency tree. Node's require(esm) interop handles jsdom at runtime.
 */
let purifier: DOMPurify | undefined;

function getPurifier(): DOMPurify {
  if (purifier) return purifier;
  let win: unknown;
  if (typeof window !== 'undefined') {
    win = window;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JSDOM } = require('jsdom') as { JSDOM: new (html: string) => { window: unknown } };
    win = new JSDOM('').window;
  }
  purifier = createDOMPurify(win as Window & typeof globalThis);
  return purifier;
}

/**
 * Strips active content from an SVG. Removes <script>, on* handlers, <foreignObject>, and
 * javascript:/data: hrefs. Returns sanitized SVG markup.
 */
export function sanitizeSvg(svg: string): string {
  return getPurifier().sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick'],
  });
}
