import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRepository, UserRow } from './auth.repository';
import { PasswordService } from '@shared/auth/password.service';
import { TokenService } from '@shared/auth/token.service';
import { OutboxService } from '@shared/messaging/outbox.service';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import type { DrizzleDB } from '@shared/database/drizzle.provider';

function userRow(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    email: 'a@b.com',
    passwordHash: 'hash',
    role: 'PLAYER',
    status: 'ACTIVE',
    emailVerified: true,
    mustChangePassword: false,
    isMinor: false,
    managedByParentUserId: null,
    firstName: 'Ann',
    lastName: 'Lee',
    phone: null,
    photoUrl: null,
    thumbnailUrl: null,
    defaultSubjectProfileId: null,
    defaultTrainerId: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('AuthService.login', () => {
  let repo: jest.Mocked<Pick<AuthRepository, 'findByEmail' | 'setLastLogin'>>;
  let passwords: jest.Mocked<Pick<PasswordService, 'verify'>>;
  let tokens: jest.Mocked<Pick<TokenService, 'issueSession'>>;
  let svc: AuthService;

  beforeEach(() => {
    repo = { findByEmail: jest.fn(), setLastLogin: jest.fn() } as never;
    passwords = { verify: jest.fn() } as never;
    tokens = {
      issueSession: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', family: 'f' }),
    } as never;
    const config = { get: () => undefined } as unknown as ConfigService;
    svc = new AuthService(
      repo as unknown as AuthRepository,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
      {} as OutboxService,
      config,
      {} as DrizzleDB,
    );
  });

  it('unknown email → INVALID_CREDENTIALS', async () => {
    repo.findByEmail.mockResolvedValue(undefined);
    await expect(svc.login({ email: 'x@y.com', password: 'p' })).rejects.toMatchObject({
      errorCode: AppErrorCode.INVALID_CREDENTIALS,
    });
  });

  it('wrong password → INVALID_CREDENTIALS', async () => {
    repo.findByEmail.mockResolvedValue(userRow());
    passwords.verify.mockResolvedValue(false);
    await expect(svc.login({ email: 'a@b.com', password: 'bad' })).rejects.toMatchObject({
      errorCode: AppErrorCode.INVALID_CREDENTIALS,
    });
  });

  it('inactive account → ACCOUNT_INACTIVE', async () => {
    repo.findByEmail.mockResolvedValue(userRow({ status: 'INACTIVE' }));
    passwords.verify.mockResolvedValue(true);
    await expect(svc.login({ email: 'a@b.com', password: 'p' })).rejects.toMatchObject({
      errorCode: AppErrorCode.ACCOUNT_INACTIVE,
    });
  });

  it('unverified → EMAIL_NOT_VERIFIED with canResend', async () => {
    repo.findByEmail.mockResolvedValue(userRow({ emailVerified: false }));
    passwords.verify.mockResolvedValue(true);
    await expect(svc.login({ email: 'a@b.com', password: 'p' })).rejects.toMatchObject({
      errorCode: AppErrorCode.EMAIL_NOT_VERIFIED,
    });
  });

  it('happy path → returns session user + tokens + records last login', async () => {
    repo.findByEmail.mockResolvedValue(userRow());
    passwords.verify.mockResolvedValue(true);
    const out = await svc.login({ email: 'A@b.com', password: 'p' });
    expect(out.user.id).toBe('u1');
    expect(out.tokens.accessToken).toBe('a');
    expect(repo.setLastLogin).toHaveBeenCalledWith('u1');
    expect(repo.findByEmail).toHaveBeenCalledWith('a@b.com'); // lower-cased
  });

  it('temp-password user logs in with mustChangePassword=true', async () => {
    repo.findByEmail.mockResolvedValue(userRow({ mustChangePassword: true }));
    passwords.verify.mockResolvedValue(true);
    const out = await svc.login({ email: 'a@b.com', password: 'p' });
    expect(out.user.mustChangePassword).toBe(true);
  });
});

describe('AuthService.verifyEmail', () => {
  function make(repo: Partial<jest.Mocked<AuthRepository>>) {
    const config = { get: () => undefined } as unknown as ConfigService;
    return new AuthService(
      repo as unknown as AuthRepository,
      {} as PasswordService,
      {} as TokenService,
      {} as OutboxService,
      config,
      {} as DrizzleDB,
    );
  }

  it('unknown token → TOKEN_INVALID', async () => {
    const svc = make({ findVerificationByHash: jest.fn().mockResolvedValue(undefined) });
    await expect(svc.verifyEmail('tok')).rejects.toMatchObject({
      errorCode: AppErrorCode.TOKEN_INVALID,
    });
  });

  it('used token → TOKEN_USED', async () => {
    const svc = make({
      findVerificationByHash: jest
        .fn()
        .mockResolvedValue({ id: 't', userId: 'u', usedAt: new Date(), expiresAt: new Date(Date.now() + 1e6) }),
    });
    await expect(svc.verifyEmail('tok')).rejects.toMatchObject({ errorCode: AppErrorCode.TOKEN_USED });
  });

  it('expired token → TOKEN_EXPIRED', async () => {
    const svc = make({
      findVerificationByHash: jest
        .fn()
        .mockResolvedValue({ id: 't', userId: 'u', usedAt: null, expiresAt: new Date(Date.now() - 1000) }),
    });
    await expect(svc.verifyEmail('tok')).rejects.toMatchObject({
      errorCode: AppErrorCode.TOKEN_EXPIRED,
    });
  });

  it('valid token → consumes + returns verified', async () => {
    const consume = jest.fn().mockResolvedValue(undefined);
    const svc = make({
      findVerificationByHash: jest
        .fn()
        .mockResolvedValue({ id: 't', userId: 'u', usedAt: null, expiresAt: new Date(Date.now() + 1e6) }),
      consumeVerification: consume,
    });
    await expect(svc.verifyEmail('tok')).resolves.toEqual({ verified: true });
    expect(consume).toHaveBeenCalledWith('t', 'u');
  });

  it('AppException carries the right shape', () => {
    expect(new AppException(AppErrorCode.TOKEN_USED).errorCode).toBe(AppErrorCode.TOKEN_USED);
  });
});
