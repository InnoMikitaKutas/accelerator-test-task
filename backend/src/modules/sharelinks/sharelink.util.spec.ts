import { computeJoinStatus, generateShareCode } from './sharelink.util';

describe('computeJoinStatus', () => {
  const now = new Date('2026-05-29T12:00:00Z');
  const base = { active: true, status: 'ACTIVE', expiresAt: null, maxUses: null, useCount: 0 };

  it('static active → VALID', () => {
    expect(computeJoinStatus(base, now)).toBe('VALID');
  });

  it('inactive / revoked → INVALID', () => {
    expect(computeJoinStatus({ ...base, active: false }, now)).toBe('INVALID');
    expect(computeJoinStatus({ ...base, status: 'REVOKED' }, now)).toBe('INVALID');
  });

  it('past expiry → EXPIRED', () => {
    expect(
      computeJoinStatus({ ...base, expiresAt: new Date('2026-05-28T00:00:00Z') }, now),
    ).toBe('EXPIRED');
  });

  it('exhausted single-use → USED', () => {
    expect(computeJoinStatus({ ...base, maxUses: 1, useCount: 1 }, now)).toBe('USED');
  });

  it('generateShareCode → unique-ish, correct length, url-safe alphabet', () => {
    const a = generateShareCode();
    const b = generateShareCode();
    expect(a).toHaveLength(12);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9]+$/);
  });
});
