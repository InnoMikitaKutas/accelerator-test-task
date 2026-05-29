import { ConfigService } from '@nestjs/config';
import { ProfileService } from './profile.service';
import { ProfilesRepository } from './profiles.repository';
import { StorageService } from '@shared/storage/storage.service';
import { ImageService } from '@shared/storage/image.service';
import { SessionPrincipal } from '@shared/context/request-context';

const principal = (role: SessionPrincipal['role']): SessionPrincipal => ({
  id: 'u1',
  role,
  email: 'a@b.com',
  emailVerified: true,
  mustChangePassword: false,
  isMinor: false,
  managedByParentUserId: null,
});

function makeService(repo: Partial<jest.Mocked<ProfilesRepository>>, storage?: unknown, images?: unknown) {
  return new ProfileService(
    repo as unknown as ProfilesRepository,
    (storage ?? {}) as StorageService,
    (images ?? {}) as ImageService,
    { get: () => undefined } as unknown as ConfigService,
  );
}

describe('ProfileService', () => {
  it('getMine assembles coach details', async () => {
    const svc = makeService({
      getUser: jest.fn().mockResolvedValue({
        id: 'u1',
        role: 'COACH',
        email: 'a@b.com',
        firstName: 'C',
        lastName: 'O',
        phone: null,
        photoUrl: null,
        thumbnailUrl: null,
      }),
      getCoachProfile: jest
        .fn()
        .mockResolvedValue({ bio: 'hi', credentials: ['x'], certifications: [], publicVisible: true }),
    });
    const out = await svc.getMine(principal('COACH'));
    expect(out.details).toMatchObject({ kind: 'coach', bio: 'hi', publicVisible: true });
  });

  it('updateMine (player) applies emergency contact + gender, not trainer fields', async () => {
    const updatePlayer = jest.fn();
    const updateTrainer = jest.fn();
    const svc = makeService({
      updateUserCommon: jest.fn(),
      updateSelfPlayerProfile: updatePlayer,
      updateTrainerProfile: updateTrainer,
      getUser: jest.fn().mockResolvedValue({
        id: 'u1',
        role: 'PLAYER',
        email: 'a@b.com',
        firstName: 'P',
        lastName: 'P',
        phone: null,
        photoUrl: null,
        thumbnailUrl: null,
      }),
      getSelfPlayerProfile: jest.fn().mockResolvedValue({ id: 'pp', gender: 'MALE' }),
    });
    await svc.updateMine(principal('PLAYER'), {
      gender: 'MALE',
      emergencyContact: { name: 'Mum', phone: '+15551112222' },
    });
    expect(updatePlayer).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ gender: 'MALE', emergencyContactName: 'Mum', emergencyContactPhone: '+15551112222' }),
    );
    expect(updateTrainer).not.toHaveBeenCalled();
  });

  it('uploadPhoto processes + stores original + thumbnail and persists URLs', async () => {
    const setUserPhoto = jest.fn();
    const put = jest
      .fn()
      .mockResolvedValueOnce({ url: 'http://x/o.webp', key: 'o' })
      .mockResolvedValueOnce({ url: 'http://x/t.webp', key: 't' });
    const images = {
      processAvatar: jest.fn().mockResolvedValue({
        original: { buffer: Buffer.from('o'), contentType: 'image/webp', ext: 'webp' },
        thumbnail: { buffer: Buffer.from('t'), contentType: 'image/webp', ext: 'webp' },
      }),
    };
    const svc = makeService({ setUserPhoto }, { put }, images);
    const out = await svc.uploadPhoto(principal('PLAYER'), {
      originalname: 'a.png',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.from('x'),
    });
    expect(out).toEqual({ photoUrl: 'http://x/o.webp', thumbnailUrl: 'http://x/t.webp' });
    expect(put).toHaveBeenCalledTimes(2);
    expect(setUserPhoto).toHaveBeenCalledWith('u1', 'http://x/o.webp', 'http://x/t.webp');
  });
});
