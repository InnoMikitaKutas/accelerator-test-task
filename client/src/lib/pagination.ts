import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Keyset / opaque-cursor pagination (NFR-002, L6).
 *
 * The cursor is an OPAQUE token: we pass `nextCursor` back verbatim as the next
 * request's `cursor` and never parse, decode, or construct one. The pure helpers
 * below own accumulation; `usePaginated` is a thin React wrapper over any RTK Query
 * list hook.
 */

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PageAccumulator<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Request cursors already merged, so a re-delivered page is a no-op. */
  seenCursors: (string | undefined)[];
}

export function emptyAccumulator<T>(): PageAccumulator<T> {
  return { items: [], nextCursor: null, hasMore: true, seenCursors: [] };
}

/** Merge a page fetched for `requestCursor`. Idempotent per cursor. Cursor opaque (L6). */
export function mergePage<T>(
  acc: PageAccumulator<T>,
  requestCursor: string | undefined,
  page: Page<T>,
): PageAccumulator<T> {
  if (acc.seenCursors.includes(requestCursor)) return acc;
  const isFirst = requestCursor === undefined;
  return {
    items: isFirst ? [...page.items] : [...acc.items, ...page.items],
    nextCursor: page.nextCursor, // stored as-is — never inspected
    hasMore: page.hasMore,
    seenCursors: [...acc.seenCursors, requestCursor],
  };
}

/** The cursor to request next — `nextCursor` verbatim, or null when exhausted. */
export function nextRequestCursor<T>(acc: PageAccumulator<T>): string | null {
  return acc.hasMore ? acc.nextCursor : null;
}

interface QueryLike<T> {
  data?: T;
  isFetching?: boolean;
  isLoading?: boolean;
}

export type ListQueryHook<T, A> = (arg: A & { cursor?: string }) => QueryLike<Page<T>>;

export interface UsePaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  isFetching: boolean;
  loadMore: () => void;
  reset: () => void;
}

/**
 * Accumulates pages from an RTK Query list hook. "Load more" sends the prior
 * `nextCursor` verbatim. Accumulation resets when `baseArg` (filters/search) changes.
 */
export function usePaginated<T, A extends Record<string, unknown>>(
  useListQuery: ListQueryHook<T, A>,
  baseArg: A,
): UsePaginatedResult<T> {
  const [requestCursor, setRequestCursor] = useState<string | undefined>(undefined);
  const [acc, setAcc] = useState<PageAccumulator<T>>(() => emptyAccumulator<T>());

  const argKey = useMemo(() => JSON.stringify(baseArg), [baseArg]);

  // Reset accumulation whenever the filters/search change.
  useEffect(() => {
    setRequestCursor(undefined);
    setAcc(emptyAccumulator<T>());
  }, [argKey]);

  const result = useListQuery({ ...baseArg, cursor: requestCursor });
  const page = result.data;

  useEffect(() => {
    if (page) setAcc((prev) => mergePage(prev, requestCursor, page));
  }, [page, requestCursor]);

  const loadMore = useCallback(() => {
    const c = nextRequestCursor(acc);
    if (c != null) setRequestCursor(c);
  }, [acc]);

  const reset = useCallback(() => {
    setRequestCursor(undefined);
    setAcc(emptyAccumulator<T>());
  }, []);

  return {
    items: acc.items,
    hasMore: acc.hasMore,
    isFetching: Boolean(result.isFetching ?? result.isLoading),
    loadMore,
    reset,
  };
}
