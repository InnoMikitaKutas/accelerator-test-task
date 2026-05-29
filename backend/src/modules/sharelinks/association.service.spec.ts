import { AssociationService } from './association.service';
import { OutboxService } from '@shared/messaging/outbox.service';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { AppErrorCode } from '@shared/common/errors/error-codes';

describe('AssociationService', () => {
  const outbox = { enqueue: jest.fn() } as unknown as OutboxService;
  const svc = new AssociationService(outbox);

  it('associatePlayer is idempotent when an active link exists', async () => {
    const insert = jest.fn();
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'a' }]) }) }) }),
      insert,
    } as unknown as DrizzleDB;
    const out = await svc.associatePlayer(tx, { trainerId: 't', playerProfileId: 'p' });
    expect(out).toEqual({ trainerId: 't', playerProfileId: 'p', status: 'active' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('associatePlayer inserts when no active link exists', async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      insert: () => ({ values }),
    } as unknown as DrizzleDB;
    await svc.associatePlayer(tx, { trainerId: 't', playerProfileId: 'p', viaShareLinkId: 'l' });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ trainerId: 't', playerProfileId: 'p', viaShareLinkId: 'l', status: 'active' }),
    );
  });

  it('associateCoach maps a unique violation to COACH_ALREADY_ASSIGNED', async () => {
    const tx = {
      insert: () => ({ values: () => Promise.reject({ code: '23505' }) }),
    } as unknown as DrizzleDB;
    await expect(svc.associateCoach(tx, { trainerId: 't', coachProfileId: 'c' })).rejects.toMatchObject({
      errorCode: AppErrorCode.COACH_ALREADY_ASSIGNED,
    });
  });

  it('associateCoach rethrows non-unique errors', async () => {
    const tx = {
      insert: () => ({ values: () => Promise.reject(new Error('boom')) }),
    } as unknown as DrizzleDB;
    await expect(svc.associateCoach(tx, { trainerId: 't', coachProfileId: 'c' })).rejects.toThrow('boom');
  });

  it('removeAssociation soft-deletes + enqueues rsvp.cancel', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const tx = { update: () => ({ set: () => ({ where }) }) } as unknown as DrizzleDB;
    await svc.removeAssociation(tx, { trainerId: 't', playerProfileId: 'p' });
    expect(where).toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, 'rsvp.cancel', { trainerId: 't', playerProfileId: 'p' });
  });
});
