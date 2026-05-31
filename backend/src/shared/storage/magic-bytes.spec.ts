import { sniffImageType } from './magic-bytes';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
const svgNoProlog = Buffer.from('   <svg xmlns="http://www.w3.org/2000/svg"/>');

describe('sniffImageType', () => {
  it('detects PNG by signature', () => expect(sniffImageType(png)).toBe('image/png'));
  it('detects JPEG by signature', () => expect(sniffImageType(jpeg)).toBe('image/jpeg'));
  it('detects SVG by leading <?xml/<svg', () => expect(sniffImageType(svg)).toBe('image/svg+xml'));
  it('detects SVG without prolog after whitespace', () =>
    expect(sniffImageType(svgNoProlog)).toBe('image/svg+xml'));
  it('returns null for an unknown/spoofed blob', () =>
    expect(sniffImageType(Buffer.from('GIF89a not allowed'))).toBeNull());
});
