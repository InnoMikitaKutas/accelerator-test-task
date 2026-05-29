import { AnonymizationService } from './anonymization.service';
import { UsersRepository, UserRow } from './users.repository';
import { TokenService } from '@shared/auth/token.service';
import { AuditService } from '@shared/audit/audit.service';
import { AppErrorCode } from '@shared/common/errors/error-codes';

function userRow(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    email: 'victim@club.com',
    passwordHash: 'h',
    role: 'PLAYER',
    status: 'ACTIVE',
    emailVerified: true,
    mustChangePassword: false,
    isMinor: false,
    managedByParentUserId: null,
    firstName: 'V',
    lastName: 'C',
    phone: '123',
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

describe('AnonymizationService.gdprDelete', () => {
  let repo: jest.Mocked<Pick<UsersRepository, 'findById' | 'anonymize'>>;
  let tokens: jest.Mocked<Pick<TokenService, 'revokeAllForUser'>>;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;
  let svc: AnonymizationService;

  beforeEach(() => {
    repo = { findById: jest.fn(), anonymize: jest.fn().mockResolvedValue('log-1') } as never;
    tokens = { revokeAllForUser: jest.fn() } as never;
    audit = { log: jest.fn() } as never;
    svc = new AnonymizationService(
      repo as unknown as UsersRepository,
      tokens as unknown as TokenService,
      audit as unknown as AuditService,
    );
  });

  it('NOT_FOUND when user missing', async () => {
    repo.findById.mockResolvedValue(undefined);
    await expect(
      svc.gdprDelete('x', { reason: 'r', confirmEmail: 'a@b.com' }, 'admin'),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_FOUND });
  });

  it('VALIDATION_ERROR when confirmEmail mismatches', async () => {
    repo.findById.mockResolvedValue(userRow());
    await expect(
      svc.gdprDelete('u1', { reason: 'r', confirmEmail: 'wrong@club.com' }, 'admin'),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.VALIDATION_ERROR });
  });

  it('anonymizes, revokes sessions, audits, and returns the deletion log', async () => {
    repo.findById.mockResolvedValue(userRow());
    const out = await svc.gdprDelete('u1', { reason: 'GDPR', confirmEmail: 'VICTIM@club.com' }, 'admin');
    expect(out).toEqual({ anonymized: true, deletionLogId: 'log-1', historyRetained: true });
    expect(repo.anonymize).toHaveBeenCalledWith('u1', {
      deletedBy: 'admin',
      reason: 'GDPR',
      originalEmail: 'victim@club.com',
    });
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(audit.log).toHaveBeenCalled();
  });
});
