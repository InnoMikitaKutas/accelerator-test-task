import { ApprovalExpirySweep } from './approval-expiry.sweep';

describe('ApprovalExpirySweep', () => {
  it('tick() expires pending approvals and enqueues a notification per row', async () => {
    const expirePending = jest.fn().mockResolvedValue([{ id: 'a1', parentUserId: 'p1', itemRef: 'kit' }]);
    const getUserEmail = jest.fn().mockResolvedValue('p@x.com');
    const enqueue = jest.fn();
    const db = { transaction: (fn: (tx: unknown) => unknown) => fn({}) };
    const sweep = new ApprovalExpirySweep(
      { expirePending, getUserEmail } as never,
      { enqueue } as never,
      { get: (_k: string, d?: unknown) => d } as never,
      db as never,
    );
    await sweep.tick();
    expect(expirePending).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      {},
      'email.child.approval-expired',
      expect.objectContaining({ to: 'p@x.com', templateId: 'child.approval-expired' }),
    );
  });

  it('skips a row whose parent has no email, still processes the rest', async () => {
    const expirePending = jest.fn().mockResolvedValue([
      { id: 'a1', parentUserId: 'p1', itemRef: 'kit' },
      { id: 'a2', parentUserId: 'p2', itemRef: 'shoes' },
    ]);
    const getUserEmail = jest
      .fn()
      .mockResolvedValueOnce(undefined) // p1 missing
      .mockResolvedValueOnce('p2@x.com');
    const enqueue = jest.fn();
    const db = { transaction: (fn: (tx: unknown) => unknown) => fn({}) };
    const sweep = new ApprovalExpirySweep(
      { expirePending, getUserEmail } as never,
      { enqueue } as never,
      { get: (_k: string, d?: unknown) => d } as never,
      db as never,
    );
    await sweep.tick();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({}, 'email.child.approval-expired', expect.objectContaining({ to: 'p2@x.com' }));
  });

  it('does not overlap runs', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const expirePending = jest.fn().mockReturnValue(gate.then(() => []));
    const sweep = new ApprovalExpirySweep(
      { expirePending, getUserEmail: jest.fn() } as never,
      { enqueue: jest.fn() } as never,
      { get: (_k: string, d?: unknown) => d } as never,
      { transaction: (fn: (tx: unknown) => unknown) => fn({}) } as never,
    );
    const first = sweep.tick();
    await sweep.tick(); // early-return while first in flight
    expect(expirePending).toHaveBeenCalledTimes(1);
    resolve();
    await first;
  });
});
