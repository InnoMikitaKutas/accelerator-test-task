import { AvailabilityService } from './availability.service';
import { AvailabilityRepository } from './availability.repository';
import { ContextResolver } from '@shared/tenancy/context-resolver';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { AuditService } from '@shared/audit/audit.service';
import { SessionPrincipal } from '@shared/context/request-context';
import { AppErrorCode } from '@shared/common/errors/error-codes';

const principal = (over: Partial<SessionPrincipal> = {}): SessionPrincipal => ({
  id: 'u1',
  role: 'PLAYER',
  email: 'a@b.com',
  emailVerified: true,
  mustChangePassword: false,
  isMinor: false,
  managedByParentUserId: null,
  ...over,
});

function make(repo: Partial<jest.Mocked<AvailabilityRepository>>, resolver: Partial<ContextResolver> = {}) {
  return new AvailabilityService(
    repo as unknown as AvailabilityRepository,
    resolver as unknown as ContextResolver,
    { currentTrainerId: () => 't-1' } as unknown as TenancyService,
    { log: jest.fn() } as unknown as AuditService,
  );
}

describe('AvailabilityService authorization', () => {
  it('owner may replace their player slots', async () => {
    const replaceSlots = jest.fn();
    const svc = make({
      getPlayerProfile: jest.fn().mockResolvedValue({ id: 'pp', userId: 'u1', parentUserId: null }),
      replaceSlots,
      getSlots: jest.fn().mockResolvedValue([]),
    });
    await svc.setFor(principal(), 'player', 'pp', { slots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }] });
    expect(replaceSlots).toHaveBeenCalled();
  });

  it('getFor → NOT_FOUND for a soft-deleted player (repo filters deletedAt)', async () => {
    // The repo now returns undefined for a soft-deleted player (L4); the service maps that to 404.
    const svc = make({ getPlayerProfile: jest.fn().mockResolvedValue(undefined) });
    await expect(svc.getFor(principal(), 'player', 'pp')).rejects.toMatchObject({
      errorCode: AppErrorCode.NOT_FOUND,
    });
  });

  it('non-owner write → TENANT_FORBIDDEN', async () => {
    const svc = make({
      getPlayerProfile: jest.fn().mockResolvedValue({ id: 'pp', userId: 'someone-else', parentUserId: null }),
    });
    await expect(
      svc.setFor(principal(), 'player', 'pp', { slots: [] }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.TENANT_FORBIDDEN });
  });

  it('overlapping slots → VALIDATION_ERROR', async () => {
    const svc = make({
      getPlayerProfile: jest.fn().mockResolvedValue({ id: 'pp', userId: 'u1', parentUserId: null }),
    });
    await expect(
      svc.setFor(principal(), 'player', 'pp', {
        slots: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' },
        ],
      }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.VALIDATION_ERROR });
  });

  it('associated trainer may read a player Best Times', async () => {
    const svc = make(
      {
        getPlayerProfile: jest.fn().mockResolvedValue({ id: 'pp', userId: 'parent', parentUserId: 'parent' }),
        getActiveAssociation: jest.fn().mockResolvedValue({ id: 'a' }),
        getSlots: jest.fn().mockResolvedValue([]),
      },
      { resolveTrainerSelf: jest.fn().mockResolvedValue('t-1') },
    );
    const out = await svc.getFor(principal({ id: 'trainer-user', role: 'TRAINER' }), 'player', 'pp');
    expect(out.subjectId).toBe('pp');
  });

  it('unrelated trainer read → TENANT_FORBIDDEN', async () => {
    const svc = make(
      {
        getPlayerProfile: jest.fn().mockResolvedValue({ id: 'pp', userId: 'parent', parentUserId: 'parent' }),
        getActiveAssociation: jest.fn().mockResolvedValue(undefined),
      },
      { resolveTrainerSelf: jest.fn().mockResolvedValue('t-9') },
    );
    await expect(
      svc.getFor(principal({ id: 'trainer-user', role: 'TRAINER' }), 'player', 'pp'),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.TENANT_FORBIDDEN });
  });
});

describe('AvailabilityService.createOverride', () => {
  it('rejects a coach not actively associated with the trainer', async () => {
    const svc = make({ activeCoachAssociationExists: jest.fn().mockResolvedValue(false) });
    await expect(
      svc.createOverride(principal({ id: 'tr', role: 'TRAINER' }), {
        eventId: 'e',
        coachId: 'c',
        reason: 'sick',
      }),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.TENANT_FORBIDDEN });
  });

  it('writes the override when an active association exists', async () => {
    const createOverride = jest.fn().mockResolvedValue({
      id: 'o',
      eventId: 'e',
      coachId: 'c',
      overriddenBy: 'tr',
      reason: 'sick',
      createdAt: new Date('2026-05-31T10:00:00Z'),
    });
    const svc = make({
      activeCoachAssociationExists: jest.fn().mockResolvedValue(true),
      createOverride,
    });
    const out = await svc.createOverride(principal({ id: 'tr', role: 'TRAINER' }), {
      eventId: 'e',
      coachId: 'c',
      reason: 'sick',
    });
    expect(out.id).toBe('o');
    expect(createOverride).toHaveBeenCalledWith(
      expect.objectContaining({ trainerId: 't-1', coachId: 'c', overriddenBy: 'tr', reason: 'sick' }),
    );
  });
});
