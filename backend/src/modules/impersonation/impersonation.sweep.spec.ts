import { ImpersonationSweep } from './impersonation.sweep';

describe('ImpersonationSweep', () => {
  it('tick() closes expired open logs via the repository', async () => {
    const closeExpiredOpenLogs = jest.fn().mockResolvedValue(2);
    const repo = { closeExpiredOpenLogs } as never;
    const config = { get: (_k: string, d?: unknown) => d } as never;
    const sweep = new ImpersonationSweep(repo, config);
    await sweep.tick();
    expect(closeExpiredOpenLogs).toHaveBeenCalledWith(expect.any(Number));
  });

  it('does not overlap runs', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const closeExpiredOpenLogs = jest.fn().mockReturnValue(gate.then(() => 0));
    const sweep = new ImpersonationSweep(
      { closeExpiredOpenLogs } as never,
      { get: (_k: string, d?: unknown) => d } as never,
    );
    const first = sweep.tick();
    await sweep.tick(); // should early-return while first is in flight
    expect(closeExpiredOpenLogs).toHaveBeenCalledTimes(1);
    resolve();
    await first;
  });
});
