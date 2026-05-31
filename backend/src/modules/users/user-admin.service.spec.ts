import { ConfigService } from '@nestjs/config';
import { UserAdminService } from './user-admin.service';
import { UsersRepository, UserRow } from './users.repository';
import { PasswordService } from '@shared/auth/password.service';
import { TokenService } from '@shared/auth/token.service';
import { AuditService } from '@shared/audit/audit.service';
import { AppErrorCode } from '@shared/common/errors/error-codes';

function userRow(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    email: 'trainer@club.com',
    passwordHash: 'h',
    role: 'TRAINER',
    status: 'ACTIVE',
    emailVerified: true,
    mustChangePassword: false,
    isMinor: false,
    managedByParentUserId: null,
    firstName: 'Tom',
    lastName: 'Trainer',
    phone: null,
    photoUrl: null,
    thumbnailUrl: null,
    defaultSubjectProfileId: null,
    defaultTrainerId: null,
    lastLoginAt: null,
    createdAt: new Date('2026-05-29T10:00:00Z'),
    updatedAt: new Date('2026-05-29T10:00:00Z'),
    ...over,
  };
}

describe('UserAdminService.createTrainer', () => {
  let repo: jest.Mocked<Pick<UsersRepository, 'findByEmail' | 'createTrainer'>>;
  let passwords: jest.Mocked<Pick<PasswordService, 'hash' | 'generateTemp'>>;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;
  let svc: UserAdminService;

  beforeEach(() => {
    repo = { findByEmail: jest.fn(), createTrainer: jest.fn() } as never;
    passwords = {
      hash: jest.fn().mockResolvedValue('hashed'),
      generateTemp: jest.fn().mockReturnValue('Temp1234'),
    } as never;
    audit = { log: jest.fn() } as never;
    const config = { get: (_k: string, d?: unknown) => d } as unknown as ConfigService;
    const tokens = { revokeAllForUser: jest.fn() } as unknown as TokenService;
    svc = new UserAdminService(
      repo as unknown as UsersRepository,
      passwords as unknown as PasswordService,
      audit as unknown as AuditService,
      config,
      tokens,
    );
  });

  it('rejects a duplicate email with EMAIL_EXISTS', async () => {
    repo.findByEmail.mockResolvedValue(userRow());
    await expect(
      svc.createTrainer({ email: 'a@b.com', firstName: 'A', lastName: 'B', businessName: 'Biz' }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.EMAIL_EXISTS });
  });

  it('INVITE mode → emailVerified, no temp password, invite link enqueued', async () => {
    repo.findByEmail.mockResolvedValue(undefined);
    repo.createTrainer.mockResolvedValue(userRow());
    await svc.createTrainer({ email: 'New@Club.com', firstName: 'A', lastName: 'B', businessName: 'Biz' });
    const arg = repo.createTrainer.mock.calls[0][0];
    expect(arg.user.email).toBe('new@club.com'); // lower-cased
    expect(arg.user.emailVerified).toBe(true);
    expect(arg.user.mustChangePassword).toBe(false);
    expect(arg.resetTokenHash).toBeDefined(); // invite uses a reset token
    expect(arg.outbox.payload.vars).not.toHaveProperty('tempPassword');
    expect(audit.log).toHaveBeenCalled();
  });

  it('TEMP_PASSWORD mode → mustChangePassword + temp password in mail vars', async () => {
    repo.findByEmail.mockResolvedValue(undefined);
    repo.createTrainer.mockResolvedValue(userRow({ mustChangePassword: true }));
    await svc.createTrainer({
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      businessName: 'Biz',
      onboardingMode: 'TEMP_PASSWORD',
    });
    const arg = repo.createTrainer.mock.calls[0][0];
    expect(arg.user.mustChangePassword).toBe(true);
    expect((arg.outbox.payload.vars as Record<string, string>).tempPassword).toBe('Temp1234');
    expect(arg.resetTokenHash).toBeUndefined();
  });
});

describe('UserAdminService deactivate/reactivate/get', () => {
  function make(repoOver: Partial<jest.Mocked<UsersRepository>>) {
    const repo = {
      findById: jest.fn(),
      setStatus: jest.fn(),
      ...repoOver,
    } as unknown as UsersRepository;
    const audit = { log: jest.fn() } as unknown as AuditService;
    const config = { get: (_k: string, d?: unknown) => d } as unknown as ConfigService;
    const tokens = { revokeAllForUser: jest.fn() } as unknown as TokenService;
    return new UserAdminService(repo, {} as PasswordService, audit, config, tokens);
  }

  it('get → NOT_FOUND when missing', async () => {
    const svc = make({ findById: jest.fn().mockResolvedValue(undefined) });
    await expect(svc.get('x')).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_FOUND });
  });

  it('deactivate sets INACTIVE', async () => {
    const svc = make({
      findById: jest.fn().mockResolvedValue(userRow()),
      setStatus: jest.fn().mockResolvedValue(userRow({ status: 'INACTIVE' })),
    });
    const out = await svc.deactivate('u1', {});
    expect(out.status).toBe('INACTIVE');
  });

  it('deactivate revokes all of the user’s sessions (immediate lockout)', async () => {
    const revokeAllForUser = jest.fn().mockResolvedValue(undefined);
    const repo = {
      findById: jest.fn().mockResolvedValue(userRow()),
      setStatus: jest.fn().mockResolvedValue(userRow({ status: 'INACTIVE' })),
    } as unknown as UsersRepository;
    const tokens = { revokeAllForUser } as unknown as TokenService;
    const svc = new UserAdminService(
      repo,
      {} as PasswordService,
      { log: jest.fn() } as unknown as AuditService,
      { get: (_k: string, d?: unknown) => d } as unknown as ConfigService,
      tokens,
    );
    await svc.deactivate('u1', {});
    expect(revokeAllForUser).toHaveBeenCalledWith('u1');
  });
});
