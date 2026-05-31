import { encodeCursor, decodeCursor, keysetPage } from './cursor.util';
import { AppException } from '../errors/app.exception';
import { AppErrorCode } from '../errors/error-codes';

describe('cursor util', () => {
  it('round-trips encode/decode', () => {
    const c = { createdAt: '2026-05-29T10:00:00.000Z', id: 'abc-123' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('throws VALIDATION_ERROR on a bad cursor', () => {
    expect(() => decodeCursor('not-base64-json')).toThrow(AppException);
  });

  it('rejects a cursor with an unparseable createdAt', () => {
    const tampered = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'x' })).toString('base64url');
    try {
      decodeCursor(tampered);
      fail('should throw');
    } catch (e) {
      expect((e as AppException).errorCode).toBe(AppErrorCode.VALIDATION_ERROR);
    }
  });

  it('accepts a valid ISO cursor', () => {
    const ok = Buffer.from(JSON.stringify({ createdAt: '2026-05-29T10:00:00.000Z', id: 'x' })).toString(
      'base64url',
    );
    expect(decodeCursor(ok).id).toBe('x');
  });

  it('keysetPage trims to limit and computes hasMore + nextCursor', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `id-${i}`,
      createdAt: `2026-05-29T0${i}:00:00.000Z`,
    }));
    const page = keysetPage(rows, 5, (r) => ({ createdAt: r.createdAt, id: r.id }));
    expect(page.items).toHaveLength(5);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor as string).id).toBe('id-4');
  });

  it('keysetPage with no overflow → no next cursor', () => {
    const rows = [{ id: 'a', createdAt: '2026-05-29T00:00:00.000Z' }];
    const page = keysetPage(rows, 5, (r) => ({ createdAt: r.createdAt, id: r.id }));
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
