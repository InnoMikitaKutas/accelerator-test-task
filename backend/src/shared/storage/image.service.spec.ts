/**
 * @jest-environment jsdom
 *
 * processLogo() now sanitizes SVG via DOMPurify, which needs a DOM `window`; the jsdom test
 * environment supplies one so the sanitizer never has to require jsdom under ts-jest.
 */
import sharp from 'sharp';
import { ImageService } from './image.service';

describe('ImageService', () => {
  const svc = new ImageService();
  let png: Buffer;

  beforeAll(async () => {
    png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
  });

  it('produces a 128x128 avatar thumbnail', async () => {
    const { thumbnail, original } = await svc.processAvatar(png);
    const meta = await sharp(thumbnail.buffer).metadata();
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(128);
    expect(original.contentType).toBe('image/webp');
  });

  it('resizes a raster logo to fit 200x200 PNG', async () => {
    const out = await svc.processLogo(png, 'image/png');
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(200);
    expect(meta.height).toBeLessThanOrEqual(200);
    expect(out.contentType).toBe('image/png');
  });

  it('processLogo sanitizes an SVG payload', async () => {
    const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>';
    const out = await svc.processLogo(Buffer.from(malicious), 'image/svg+xml');
    expect(out.contentType).toBe('image/svg+xml');
    expect(out.ext).toBe('svg');
    const text = out.buffer.toString('utf8');
    expect(text).not.toMatch(/<script/i);
    expect(text).not.toMatch(/alert/);
    expect(text).toMatch(/<circle/i); // benign content preserved
  });
});
