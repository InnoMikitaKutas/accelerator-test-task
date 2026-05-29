import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalStorageAdapter } from './local-storage.adapter';
import { ImageService } from './image.service';

/** Binds StorageService by STORAGE_DRIVER (only `local` implemented in Epic-01; S3 slots in here). */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: LocalStorageAdapter }, ImageService],
  exports: [StorageService, ImageService],
})
export class StorageModule {}
