import Redis from 'ioredis';
import { BrandingService } from './branding.service';
import { BrandingRepository } from './branding.repository';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { StorageService } from '@shared/storage/storage.service';
import { ImageService } from '@shared/storage/image.service';
import { AppErrorCode } from '@shared/common/errors/error-codes';

function make(repo: Partial<jest.Mocked<BrandingRepository>>, redis: Partial<Redis>) {
  const tenancy = { currentTrainerId: () => 't-1' } as unknown as TenancyService;
  return new BrandingService(
    repo as unknown as BrandingRepository,
    tenancy,
    {} as StorageService,
    {} as ImageService,
    redis as Redis,
  );
}

describe('BrandingService.getByTrainer', () => {
  it('returns the cached value on a cache hit', async () => {
    const cached = { trainerId: 't-1', logoUrl: null, primaryColorHex: '#000000', updatedAt: 'x' };
    const svc = make({}, { get: jest.fn().mockResolvedValue(JSON.stringify(cached)) });
    expect(await svc.getByTrainer('t-1')).toEqual(cached);
  });

  it('404s when the trainer does not exist', async () => {
    const svc = make(
      { trainerExists: jest.fn().mockResolvedValue(false) },
      { get: jest.fn().mockResolvedValue(null) },
    );
    await expect(svc.getByTrainer('nope')).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_FOUND });
  });

  it('falls back to the default hex when no branding row exists, then caches', async () => {
    const set = jest.fn();
    const svc = make(
      { trainerExists: jest.fn().mockResolvedValue(true), getByTrainer: jest.fn().mockResolvedValue(undefined) },
      { get: jest.fn().mockResolvedValue(null), set },
    );
    const out = await svc.getByTrainer('t-1');
    expect(out.primaryColorHex).toBe('#1A73E8');
    expect(set).toHaveBeenCalled();
  });
});

describe('BrandingService.setColor', () => {
  it('upserts + invalidates the cache', async () => {
    const del = jest.fn();
    const upsert = jest.fn().mockResolvedValue({
      trainerId: 't-1',
      logoUrl: null,
      primaryColorHex: '#ABCDEF',
      updatedAt: new Date(),
    });
    const svc = make({ upsert }, { del });
    const out = await svc.setColor({ primaryColorHex: '#ABCDEF' });
    expect(out.primaryColorHex).toBe('#ABCDEF');
    expect(del).toHaveBeenCalledWith('branding:t-1');
  });
});
