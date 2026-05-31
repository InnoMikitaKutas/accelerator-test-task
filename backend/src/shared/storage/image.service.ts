import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { sanitizeSvg } from './svg-sanitizer';

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

@Injectable()
export class ImageService {
  /** Avatar (FR-038): normalized original + 128×128 thumbnail, both WebP. */
  async processAvatar(input: Buffer): Promise<{ original: ProcessedImage; thumbnail: ProcessedImage }> {
    const original = await sharp(input)
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const thumbnail = await sharp(input)
      .rotate()
      .resize(128, 128, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
    return {
      original: { buffer: original, contentType: 'image/webp', ext: 'webp' },
      thumbnail: { buffer: thumbnail, contentType: 'image/webp', ext: 'webp' },
    };
  }

  /** Logo (FR-037): ~200×200. SVG is sanitized (stored-XSS defense); raster is normalized to PNG. */
  async processLogo(input: Buffer, mime: string): Promise<ProcessedImage> {
    if (mime === 'image/svg+xml') {
      const clean = sanitizeSvg(input.toString('utf8'));
      return { buffer: Buffer.from(clean, 'utf8'), contentType: mime, ext: 'svg' };
    }
    const out = await sharp(input)
      .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return { buffer: out, contentType: 'image/png', ext: 'png' };
  }
}
