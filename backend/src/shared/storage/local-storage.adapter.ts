import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { StorageService, PutResult } from './storage.service';

/**
 * Dev adapter — writes to STORAGE_LOCAL_DIR, intended to be served at STORAGE_PUBLIC_BASE_URL.
 * SAFE-SERVING CONTRACT (FR-037/§13): user-uploaded assets MUST be served from a COOKIELESS
 * origin (prod: S3 + CDN) with `Content-Disposition: attachment` and `X-Content-Type-Options:
 * nosniff`. SVG is additionally sanitized at upload (image.service.processLogo). There is no
 * `/static` route in Epic-01; wiring one MUST honor this contract.
 */
@Injectable()
export class LocalStorageAdapter extends StorageService {
  constructor(private readonly config: ConfigService) {
    super();
  }

  private get dir(): string {
    return this.config.get<string>('STORAGE_LOCAL_DIR', './uploads');
  }

  async put(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    const full = join(this.dir, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    // Persist the content-type as a sidecar so a future static server / S3 adapter can emit the
    // correct Content-Type + Content-Disposition: attachment (FR-037/§13 safe-serving contract).
    await writeFile(`${full}.meta.json`, JSON.stringify({ contentType }), 'utf8');
    const base = this.config.get<string>('STORAGE_PUBLIC_BASE_URL', 'http://localhost:3000/static');
    return { key, url: `${base}/${key}` };
  }

  async delete(key: string): Promise<void> {
    const full = join(this.dir, key);
    await rm(full, { force: true });
    await rm(`${full}.meta.json`, { force: true });
  }
}
