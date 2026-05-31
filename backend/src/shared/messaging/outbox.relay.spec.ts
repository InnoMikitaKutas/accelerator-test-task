import { OutboxRelay } from './outbox.relay';

type Row = { id: string; type: string; payload: Record<string, unknown>; attempts: number };

/**
 * Builds a mock SYSTEM db whose `transaction` runs the claim callback against a tx, plus a
 * top-level `update().set().where()` used for the per-row mark OUTSIDE the tx. `markSet` captures
 * the mark payloads; `order` records claim-vs-send ordering.
 */
function makeRelay(claimed: Row[], sendImpl: () => Promise<void>) {
  const order: string[] = [];
  const txLeaseWhere = jest.fn(() => {
    order.push('claim-lease');
    return Promise.resolve(undefined);
  });
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: () => ({ for: () => Promise.resolve(claimed) }) }) }),
      }),
    }),
    update: () => ({ set: () => ({ where: txLeaseWhere }) }),
  };
  const markSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
  const db = {
    transaction: (fn: (tx: unknown) => unknown) => fn(tx),
    update: () => ({ set: markSet }),
  };
  const send = jest.fn(() => {
    order.push('send');
    return sendImpl();
  });
  const mailer = { send } as never;
  const config = { get: (_k: string, d?: unknown) => d } as never;
  const relay = new OutboxRelay(db as never, mailer, config);
  return { relay, markSet, send, order };
}

const okSend = () => Promise.resolve();
const failSend = () => Promise.reject(new Error('smtp down'));

describe('OutboxRelay.tick', () => {
  it('dispatches OUTSIDE the claim tx and marks SENT on success', async () => {
    const { relay, markSet, send, order } = makeRelay(
      [{ id: 'm1', type: 'email.verification', payload: { to: 'a@b.com' }, attempts: 0 }],
      okSend,
    );
    await relay.tick();
    expect(send).toHaveBeenCalledTimes(1);
    // claim lease commits before the send happens (no network I/O under the row lock).
    expect(order).toEqual(['claim-lease', 'send']);
    expect(markSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'SENT' }));
  });

  it('backs off (pushes availableAt) on a transient failure below MAX_ATTEMPTS', async () => {
    const { relay, markSet } = makeRelay(
      [{ id: 'm2', type: 'email.verification', payload: {}, attempts: 0 }],
      failSend,
    );
    await relay.tick();
    const arg = markSet.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('status'); // not terminal yet
    expect(arg.availableAt).toBeInstanceOf(Date);
    expect((arg.availableAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('dead-letters (DEAD) once attempts reach MAX_ATTEMPTS', async () => {
    const { relay, markSet } = makeRelay(
      [{ id: 'm3', type: 'email.verification', payload: {}, attempts: 5 }], // attempt = 6 = MAX
      failSend,
    );
    await relay.tick();
    expect(markSet).toHaveBeenCalledWith({ status: 'DEAD' });
  });

  it('does nothing when no rows are claimed', async () => {
    const { relay, markSet, send } = makeRelay([], okSend);
    await relay.tick();
    expect(send).not.toHaveBeenCalled();
    expect(markSet).not.toHaveBeenCalled();
  });

  it('does not overlap runs', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const transaction = jest.fn(() => gate.then(() => []));
    const db = {
      transaction,
      update: () => ({ set: jest.fn().mockReturnValue({ where: jest.fn() }) }),
    };
    const relay = new OutboxRelay(db as never, { send: jest.fn() } as never, {
      get: (_k: string, d?: unknown) => d,
    } as never);
    const first = relay.tick();
    await relay.tick(); // should early-return while the first is in flight
    expect(transaction).toHaveBeenCalledTimes(1);
    resolve();
    await first;
  });
});
