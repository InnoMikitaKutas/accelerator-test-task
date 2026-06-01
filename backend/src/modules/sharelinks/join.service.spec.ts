import { JoinService } from './join.service';
import { AssociationService } from './association.service';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { SessionPrincipal } from '@shared/context/request-context';
import { AppErrorCode } from '@shared/common/errors/error-codes';

const principal = (over: Partial<SessionPrincipal> = {}): SessionPrincipal =>
  ({ id: 'u1', isMinor: false, managedByParentUserId: null, ...over }) as SessionPrincipal;

const link = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  code: 'code',
  type: 'static',
  trainerId: 't1',
  useCount: 0,
  status: 'ACTIVE',
  active: true,
  expiresAt: null,
  maxUses: null,
  targetEmail: null,
  ...over,
});

/** Builds a JoinService whose `db.transaction` runs the callback against the supplied `tx`. */
function make(tx: unknown, associations: Partial<AssociationService> = {}) {
  const db = { transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as DrizzleDB;
  return new JoinService(
    db,
    associations as AssociationService,
    {} as never, // passwords
    {} as never, // tokens
    { enqueue: jest.fn() } as never, // outbox
    {} as never, // auth
    { get: (_k: string, d?: unknown) => d } as never, // config
  );
}

describe('JoinService.associateExisting', () => {
  it('rejects a unique (coach-invite) link — must be redeemed by creating an account', async () => {
    const limit = jest.fn().mockResolvedValue([link({ type: 'unique', maxUses: 1 })]);
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit }) }) }) }),
    };
    const svc = make(tx);
    await expect(svc.associateExisting('code', principal(), {})).rejects.toMatchObject({
      errorCode: AppErrorCode.VALIDATION_ERROR,
    });
  });

  it('associates a player and bumps useCount for a static link (no terminal transition)', async () => {
    const staticLink = link({ type: 'static', useCount: 2, maxUses: null });
    const limit = jest
      .fn()
      .mockResolvedValueOnce([staticLink]) // lockValidLink
      .mockResolvedValueOnce([{ id: 'pp1', userId: 'u1', parentUserId: null }]); // owned profile
    const setFn = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit }), limit }) }) }),
      update: () => ({ set: setFn }),
    };
    const associatePlayer = jest
      .fn()
      .mockResolvedValue({ trainerId: 't1', playerProfileId: 'pp1', status: 'active' });
    const svc = make(tx, { associatePlayer });

    const out = await svc.associateExisting('code', principal(), { subjectProfileId: 'pp1' });

    expect(associatePlayer).toHaveBeenCalled();
    expect(out.context).toEqual({ subjectProfileId: 'pp1', trainerId: 't1' });
    // static is multi-use: useCount bumped, but NO status/active terminal transition.
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({ useCount: 3 }));
    const setArg = setFn.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg).not.toHaveProperty('status');
    expect(setArg).not.toHaveProperty('active');
  });

  it('blocks a minor and never reads the link', async () => {
    const limit = jest.fn();
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit }) }) }) }),
    };
    const svc = make(tx);
    await expect(
      svc.associateExisting('code', principal({ isMinor: true, managedByParentUserId: null }), {}),
    ).rejects.toMatchObject({ errorCode: AppErrorCode.MINOR_FORBIDDEN });
    expect(limit).not.toHaveBeenCalled();
  });
});
