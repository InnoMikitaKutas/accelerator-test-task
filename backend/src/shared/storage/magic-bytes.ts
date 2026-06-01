/**
 * Content-based image type detection (defense-in-depth for FR-037/§13). We sniff the actual
 * bytes instead of trusting the client-supplied `file.mimetype`. Deliberately tiny and
 * synchronous to avoid the ESM-only `file-type` package in this CommonJS build.
 */
export type SniffedImageType = 'image/png' | 'image/jpeg' | 'image/svg+xml';

export function sniffImageType(buf: Buffer): SniffedImageType | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // SVG is text: allow leading BOM/whitespace, then require `<?xml` or `<svg`.
  const head = buf.subarray(0, 256).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'image/svg+xml';
  return null;
}
