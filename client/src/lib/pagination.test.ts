import { renderHook, act } from '@testing-library/react';
import {
  usePaginated,
  mergePage,
  nextRequestCursor,
  emptyAccumulator,
  type Page,
} from './pagination';

describe('pagination pure logic (L6)', () => {
  it('replaces on the first page and appends subsequent pages', () => {
    let acc = emptyAccumulator<number>();
    acc = mergePage(acc, undefined, { items: [1, 2], nextCursor: 'c1', hasMore: true });
    expect(acc.items).toEqual([1, 2]);
    acc = mergePage(acc, 'c1', { items: [3, 4], nextCursor: 'c2', hasMore: true });
    expect(acc.items).toEqual([1, 2, 3, 4]);
  });

  it('passes the opaque nextCursor back verbatim (never parsed/constructed)', () => {
    const opaque = 'eyJjcmVhdGVkQXQiOiIyMDI2In0=:7f3a';
    let acc = emptyAccumulator<number>();
    acc = mergePage(acc, undefined, { items: [1], nextCursor: opaque, hasMore: true });
    expect(nextRequestCursor(acc)).toBe(opaque);
  });

  it('stops (null next cursor) once hasMore is false', () => {
    let acc = emptyAccumulator<number>();
    acc = mergePage(acc, undefined, { items: [1], nextCursor: 'c1', hasMore: false });
    expect(nextRequestCursor(acc)).toBeNull();
  });

  it('is idempotent for a re-delivered page (no double append)', () => {
    const page: Page<number> = { items: [1, 2], nextCursor: 'c1', hasMore: true };
    let acc = emptyAccumulator<number>();
    acc = mergePage(acc, undefined, page);
    acc = mergePage(acc, undefined, page);
    expect(acc.items).toEqual([1, 2]);
  });
});

describe('usePaginated', () => {
  const PAGES: Record<string, Page<number>> = {
    first: { items: [1, 2], nextCursor: 'c1', hasMore: true },
    c1: { items: [3, 4], nextCursor: 'c2', hasMore: true },
    c2: { items: [5], nextCursor: null, hasMore: false },
  };
  const useFakeQuery = (arg: { cursor?: string }) => ({
    data: PAGES[arg.cursor ?? 'first'],
    isFetching: false,
  });

  it('accumulates pages via loadMore and stops at the end', () => {
    const { result } = renderHook(() => usePaginated(useFakeQuery, {}));

    expect(result.current.items).toEqual([1, 2]);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    expect(result.current.items).toEqual([1, 2, 3, 4]);

    act(() => result.current.loadMore());
    expect(result.current.items).toEqual([1, 2, 3, 4, 5]);
    expect(result.current.hasMore).toBe(false);

    act(() => result.current.loadMore()); // past the end → no-op
    expect(result.current.items).toEqual([1, 2, 3, 4, 5]);
  });
});
