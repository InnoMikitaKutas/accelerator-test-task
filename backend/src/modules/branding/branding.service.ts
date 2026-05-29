import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '@shared/redis/redis.constants';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { StorageService } from '@shared/storage/storage.service';
import { ImageService } from '@shared/storage/image.service';
import { UploadedFile } from '@shared/storage/file-validation';
import { BrandingRepository, BrandingRow } from './branding.repository';
import { BrandingResponseDto, UpdateBrandingDto } from './dto/branding.dto';

const DEFAULT_HEX = '#1A73E8';
const CACHE_TTL = 3600;

@Injectable()
export class BrandingService {
  constructor(
    private readonly repo: BrandingRepository,
    private readonly tenancy: TenancyService,
    private readonly storage: StorageService,
    private readonly images: ImageService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async getOwn(): Promise<BrandingResponseDto> {
    const trainerId = this.tenancy.currentTrainerId();
    return this.toResponse(trainerId, await this.repo.getOwn());
  }

  async setColor(dto: UpdateBrandingDto): Promise<BrandingResponseDto> {
    const row = await this.repo.upsert({ primaryColorHex: dto.primaryColorHex });
    await this.invalidate(row.trainerId);
    return this.toResponse(row.trainerId, row);
  }

  async uploadLogo(file: UploadedFile): Promise<BrandingResponseDto> {
    const trainerId = this.tenancy.currentTrainerId();
    const processed = await this.images.processLogo(file.buffer, file.mimetype);
    const stored = await this.storage.put(
      `branding/${trainerId}/${randomUUID()}.${processed.ext}`,
      processed.buffer,
      processed.contentType,
    );
    const row = await this.repo.upsert({ logoUrl: stored.url });
    await this.invalidate(trainerId);
    return this.toResponse(trainerId, row);
  }

  /** FR-037 — cached cross-tenant read used by players to theme the active context. */
  async getByTrainer(trainerId: string): Promise<BrandingResponseDto> {
    const cached = await this.redis.get(this.key(trainerId));
    if (cached) return JSON.parse(cached) as BrandingResponseDto;

    if (!(await this.repo.trainerExists(trainerId))) throw new AppException(AppErrorCode.NOT_FOUND);
    const resp = this.toResponse(trainerId, await this.repo.getByTrainer(trainerId));
    await this.redis.set(this.key(trainerId), JSON.stringify(resp), 'EX', CACHE_TTL);
    return resp;
  }

  private toResponse(trainerId: string, row?: BrandingRow): BrandingResponseDto {
    return {
      trainerId,
      logoUrl: row?.logoUrl ?? null,
      primaryColorHex: row?.primaryColorHex ?? DEFAULT_HEX,
      updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
    };
  }

  private key(trainerId: string): string {
    return `branding:${trainerId}`;
  }

  private async invalidate(trainerId: string): Promise<void> {
    await this.redis.del(this.key(trainerId));
  }
}
