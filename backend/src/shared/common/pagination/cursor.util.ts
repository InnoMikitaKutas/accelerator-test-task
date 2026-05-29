import { AppException } from '../errors/app.exception';
import { AppErrorCode } from '../errors/error-codes';

/** Keyset cursor over (createdAt, id) — stable ordering for NFR-002 pagination. */
export interface Cursor {
  createdAt: string;
  id: string;
}

export const encodeCursor = (c: Cursor): string =>
  Buffer.from(JSON.stringify(c)).toString('base64url');

export function decodeCursor(s: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof c.createdAt !== 'string' || typeof c.id !== 'string') throw new Error('bad');
    return { createdAt: c.createdAt, id: c.id };
  } catch {
    throw new AppException(AppErrorCode.VALIDATION_ERROR, {
      details: [{ field: 'cursor', message: 'Invalid cursor' }],
    });
  }
}

/**
 * Given `limit + 1` rows fetched in order, trims to `limit` and computes the next cursor.
 * `toCursor` extracts the keyset fields from the last returned row.
 */
export function keysetPage<T>(
  rows: T[],
  limit: number,
  toCursor: (item: T) => Cursor,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0 ? encodeCursor(toCursor(items[items.length - 1])) : null;
  return { items, nextCursor, hasMore };
}
