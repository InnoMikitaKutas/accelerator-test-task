import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { StorageService, PutResult } from './storage.service';

/** Dev adapter — writes to STORAGE_LOCAL_DIR, served at STORAGE_PUBLIC_BASE_URL (STORAGE_DRIVER=local). */
@Injectable()
export class LocalStorageAdapter extends StorageService {
  constructor(private readonly config: ConfigService) {
    super();
  }

  private get dir(): string {
    return this.config.get<string>('STORAGE_LOCAL_DIR', './uploads');
  }

  async put(key: string, body: Buffer): Promise<PutResult> {
    const full = join(this.dir, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    const base = this.config.get<string>('STORAGE_PUBLIC_BASE_URL', 'http://localhost:3000/static');
    return { key, url: `${base}/${key}` };
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.dir, key), { force: true });
  }
}
