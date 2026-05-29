import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationRepository, UserRow } from './impersonation.repository';
import { TokenService } from '@shared/auth/token.service';
import { AuthService } from '@modules/auth/auth.service';
import { AuditService } from '@shared/audit/audit.service';
import { AppErrorCode } from '@shared/common/errors/error-codes';

function userRow(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'target-1',
    email: 't@b.com',
    passwordHash: 'h',
    role: 'PLAYER',
    status: 'ACTIVE',
    emailVerified: true,
    mustChangePassword: false,
    isMinor: false,
    managedByParentUserId: null,
    firstName: 'Tara',
    lastName: 'Get',
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

function make(over: {
  repo?: Partial<jest.Mocked<ImpersonationRepository>>;
  cls?: Partial<ClsService>;
}) {
  const repo = {
    findUserById: jest.fn(),
    startLog: jest.fn().mockResolvedValue('log-1'),
    closeOpenLog: jest.fn(),
    ...over.repo,
  } as unknown as ImpersonationRepository;
  const tokens = {
    issueImpersonation: jest.fn().mockResolvedValue('imp-token'),
    issueSession: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', family: 'f' }),
  } as unknown as TokenService;
  const auth = { claimsFrom: jest.fn().mockReturnValue({}) } as unknown as AuthService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  const cls = { get: jest.fn().mockReturnValue(undefined), ...over.cls } as unknown as ClsService;
  const config = { get: (_k: string, d?: unknown) => d } as unknown as ConfigService;
  return { svc: new ImpersonationService(repo, tokens, auth, audit, cls, config), repo, tokens };
}

describe('ImpersonationService.start', () => {
  it('blocks impersonating a Super Admin', async () => {
    const { svc } = make({ repo: { findUserById: jest.fn().mockResolvedValue(userRow({ role: 'SUPER_ADMIN' })) } });
    await expect(svc.start('admin', 'target-1', {})).rejects.toMatchObject({
      errorCode: AppErrorCode.IMPERSONATE_SUPER_ADMIN,
    });
  });

  it('blocks an inactive target', async () => {
    const { svc } = make({ repo: { findUserById: jest.fn().mockResolvedValue(userRow({ status: 'INACTIVE' })) } });
    await expect(svc.start('admin', 'target-1', {})).rejects.toMatchObject({
      errorCode: AppErrorCode.ACCOUNT_INACTIVE,
    });
  });

  it('404s an unknown target', async () => {
    const { svc } = make({ repo: { findUserById: jest.fn().mockResolvedValue(undefined) } });
    await expect(svc.start('admin', 'x', {})).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_FOUND });
  });

  it('issues an impersonation token + writes the log on success', async () => {
    const startLog = jest.fn().mockResolvedValue('log-1');
    const { svc } = make({ repo: { findUserById: jest.fn().mockResolvedValue(userRow()), startLog } });
    const out = await svc.start('admin', 'target-1', { reason: 'support' });
    expect(out.token).toBe('imp-token');
    expect(out.state.impersonating).toBe(true);
    expect(out.state.targetUserId).toBe('target-1');
    expect(startLog).toHaveBeenCalledWith('admin', 'target-1', 'support');
  });
});

describe('ImpersonationService.exit', () => {
  it('is a no-op when not impersonating', async () => {
    const { svc } = make({ cls: { get: jest.fn().mockReturnValue(undefined) } });
    const out = await svc.exit();
    expect(out.state.impersonating).toBe(false);
    expect(out.tokens).toBeUndefined();
  });

  it('closes the log + re-issues the admin session', async () => {
    const closeOpenLog = jest.fn().mockResolvedValue({ id: 'log-1' });
    const { svc } = make({
      repo: { closeOpenLog, findUserById: jest.fn().mockResolvedValue(userRow({ id: 'admin', role: 'SUPER_ADMIN' })) },
      cls: { get: jest.fn().mockReturnValue('admin') },
    });
    const out = await svc.exit();
    expect(closeOpenLog).toHaveBeenCalledWith('admin');
    expect(out.tokens?.accessToken).toBe('a');
  });
});
