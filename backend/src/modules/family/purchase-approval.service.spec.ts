import { ConfigService } from '@nestjs/config';
import { PurchaseApprovalService } from './purchase-approval.service';
import { ApprovalRow, FamilyRepository } from './family.repository';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { OutboxService } from '@shared/messaging/outbox.service';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { SessionPrincipal } from '@shared/context/request-context';
import { AppErrorCode } from '@shared/common/errors/error-codes';

const principal = (over: Partial<SessionPrincipal> = {}): SessionPrincipal => ({
  id: 'child-1',
  role: 'PLAYER',
  email: 'c@b.com',
  emailVerified: true,
  mustChangePassword: false,
  isMinor: true,
  managedByParentUserId: 'parent-1',
  ...over,
});

const child = { id: 'cp', userId: 'child-1', parentUserId: 'parent-1', firstName: 'Kid', lastName: 'P' };

function approvalRow(over: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: 'ap-1',
    childProfileId: 'cp',
    parentUserId: 'parent-1',
    trainerId: 't-1',
    itemRef: 'event-9',
    paymentType: 'USD',
    amount: 2500,
    status: 'PENDING',
    requestedAt: new Date(),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 86400_000),
    childNote: null,
    parentNote: null,
    createdAt: new Date(),
    ...over,
  };
}

function make(repo: Partial<jest.Mocked<FamilyRepository>>) {
  const tenancy = { currentTrainerId: () => 't-1' } as unknown as TenancyService;
  const outbox = { enqueue: jest.fn() } as unknown as OutboxService;
  const config = { get: (_k: string, d?: unknown) => d } as unknown as ConfigService;
  const db = { transaction: (fn: (tx: unknown) => unknown) => fn({}) } as unknown as DrizzleDB;
  return new PurchaseApprovalService(repo as unknown as FamilyRepository, tenancy, outbox, config, db);
}

describe('PurchaseApprovalService.createRequest', () => {
  it('USD → PENDING and notifies the parent', async () => {
    const createApproval = jest.fn().mockImplementation((_t, v) => approvalRow(v));
    const getUserEmail = jest.fn().mockResolvedValue('parent@b.com');
    const svc = make({
      getChildById: jest.fn().mockResolvedValue(child),
      getTokenSetting: jest.fn().mockResolvedValue(false),
      createApproval,
      getUserEmail,
    });
    const out = await svc.createRequest(principal(), { childProfileId: 'cp', itemRef: 'event-9', paymentType: 'USD', amount: 2500 });
    expect(out.status).toBe('PENDING');
    expect(getUserEmail).toHaveBeenCalledWith('parent-1');
  });

  it('TOKEN with allowTokenWithoutApproval → auto-APPROVED, no parent email', async () => {
    const getUserEmail = jest.fn();
    const svc = make({
      getChildById: jest.fn().mockResolvedValue(child),
      getTokenSetting: jest.fn().mockResolvedValue(true),
      createApproval: jest.fn().mockImplementation((_t, v) => approvalRow(v)),
      getUserEmail,
    });
    const out = await svc.createRequest(principal(), { childProfileId: 'cp', itemRef: 'event-9', paymentType: 'TOKEN' });
    expect(out.status).toBe('APPROVED');
    expect(getUserEmail).not.toHaveBeenCalled();
  });

  it('rejects a child not owned by the caller', async () => {
    const svc = make({ getChildById: jest.fn().mockResolvedValue({ ...child, userId: 'x', parentUserId: 'y' }) });
    await expect(
      svc.createRequest(principal(), { childProfileId: 'cp', itemRef: 'e', paymentType: 'TOKEN' }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.TENANT_FORBIDDEN });
  });
});

describe('PurchaseApprovalService.approve/deny', () => {
  it('approves a PENDING request', async () => {
    const decideApproval = jest.fn();
    const svc = make({
      findApproval: jest.fn().mockResolvedValue({ ...approvalRow(), childDisplayName: 'Kid P' }),
      decideApproval,
    });
    const out = await svc.approve(principal({ id: 'parent-1', isMinor: false }), 'ap-1', {});
    expect(out.status).toBe('APPROVED');
    expect(decideApproval).toHaveBeenCalledWith('ap-1', 'APPROVED', undefined);
  });

  it('blocks deciding an already-decided request', async () => {
    const svc = make({
      findApproval: jest.fn().mockResolvedValue({ ...approvalRow({ status: 'APPROVED' }), childDisplayName: 'Kid P' }),
    });
    await expect(svc.approve(principal({ id: 'parent-1' }), 'ap-1', {})).rejects.toMatchObject({
      errorCode: AppErrorCode.APPROVAL_ALREADY_DECIDED,
    });
  });

  it('blocks deciding an expired request', async () => {
    const svc = make({
      findApproval: jest
        .fn()
        .mockResolvedValue({ ...approvalRow({ expiresAt: new Date(Date.now() - 1000) }), childDisplayName: 'Kid P' }),
    });
    await expect(svc.deny(principal({ id: 'parent-1' }), 'ap-1', {})).rejects.toMatchObject({
      errorCode: AppErrorCode.APPROVAL_EXPIRED,
    });
  });

  it('lazily reports a PENDING-past-expiry request as EXPIRED on read', async () => {
    const svc = make({
      findApproval: jest
        .fn()
        .mockResolvedValue({ ...approvalRow({ expiresAt: new Date(Date.now() - 1000) }), childDisplayName: 'Kid P' }),
    });
    const out = await svc.get('parent-1', 'ap-1');
    expect(out.status).toBe('EXPIRED');
  });
});
