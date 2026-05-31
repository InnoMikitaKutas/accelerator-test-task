import { fetchBaseQuery } from '@reduxjs/toolkit/query';
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
  FetchBaseQueryMeta,
} from '@reduxjs/toolkit/query';
import type { ContextRef } from '@/types/api';
import { ensureCsrfToken, getCsrfToken, clearCsrfToken } from './csrf';

/**
 * The single most important non-visual module in the app.
 *
 * Wraps fetchBaseQuery with: credentials:'include' (cookie auth, M5) · X-CSRF-Token
 * on mutating methods — the token is fetched from GET /auth/csrf and cached before
 * the request, since the `csrf` cookie is HttpOnly and unreadable (F-4) ·
 * X-Active-Context on subject-scoped endpoints (F-5) · single-flight 401→refresh→retry,
 * falling back to session/cleared when the refresh itself fails (H1 expiry, H2 revoked
 * family) · a one-shot 403 CSRF_INVALID → re-prime token → retry for a stale token.
 */

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL,
  credentials: 'include',
});

/** Per-endpoint flags, passed via RTK Query `extraOptions`. */
export interface ScopedExtraOptions {
  /** Inject X-Active-Context from the activeContext slice (Zone-3 / subject-scoped). */
  scoped?: boolean;
}

/** The slice of store state this query reads (full slice lives in activeContextSlice, 1.3). */
interface ReadableState {
  activeContext?: { current: ContextRef | null };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Normalize args to FetchArgs and attach CSRF (mutations) + active-context (scoped). */
function decorate(args: string | FetchArgs, scoped: boolean, context: ContextRef | null): FetchArgs {
  const out: FetchArgs = typeof args === 'string' ? { url: args } : { ...args };
  const headers = new Headers(out.headers as HeadersInit | undefined);

  const method = (out.method ?? 'GET').toUpperCase();
  if (!SAFE_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  if (scoped && context) {
    headers.set('X-Active-Context', `${context.subjectProfileId}:${context.trainerId}`);
  }

  out.headers = headers;
  return out;
}

/** The (uppercased) HTTP method for either arg form; defaults to GET. */
function methodOf(args: string | FetchArgs): string {
  return typeof args === 'string' ? 'GET' : (args.method ?? 'GET').toUpperCase();
}

/** Mutating requests (non-safe methods) must carry an X-CSRF-Token. */
function isMutating(args: string | FetchArgs): boolean {
  return !SAFE_METHODS.has(methodOf(args));
}

/** Only a genuine access-token expiry (UNAUTHENTICATED) is recoverable by refresh. */
function isAuthExpiry(error: FetchBaseQueryError | undefined): boolean {
  if (!error || error.status !== 401) return false;
  return (error.data as { errorCode?: string } | undefined)?.errorCode === 'UNAUTHENTICATED';
}

/** A stale/rotated CSRF token (403 CSRF_INVALID) → re-prime once and retry. */
function isCsrfInvalid(error: FetchBaseQueryError | undefined): boolean {
  if (!error || error.status !== 403) return false;
  return (error.data as { errorCode?: string } | undefined)?.errorCode === 'CSRF_INVALID';
}

// Single-flight latch: concurrent 401s share one POST /auth/refresh.
type RawResult = Awaited<ReturnType<typeof rawBaseQuery>>;
let refreshInFlight: Promise<RawResult> | null = null;

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError,
  ScopedExtraOptions,
  FetchBaseQueryMeta
> = async (args, api, extraOptions) => {
  const scoped = Boolean(extraOptions?.scoped);
  const context = (api.getState() as ReadableState).activeContext?.current ?? null;
  const mutating = isMutating(args);

  // Mutations echo X-CSRF-Token; the token comes from GET /auth/csrf (the HttpOnly
  // `csrf` cookie can't be read), fetched + cached once before the request (F-4).
  if (mutating) await ensureCsrfToken();

  let result = await rawBaseQuery(decorate(args, scoped, context), api, extraOptions);

  if (isAuthExpiry(result.error)) {
    if (!refreshInFlight) {
      // POST /auth/refresh is itself a mutation, so prime the CSRF token first; then
      // Promise.resolve coerces the MaybePromise return type to a real Promise.
      refreshInFlight = Promise.resolve(
        ensureCsrfToken().then(() =>
          rawBaseQuery(decorate({ url: '/auth/refresh', method: 'POST' }, false, null), api, extraOptions),
        ),
      );
      // Release the latch once it settles so a later expiry starts a fresh refresh.
      void refreshInFlight.finally(() => {
        refreshInFlight = null;
      });
    }

    const refresh = await refreshInFlight;

    if (refresh.error) {
      // Refresh failed: rt expired (H1) or whole family revoked (H2). End the session;
      // the router redirects to /login with a "Your session ended" notice.
      api.dispatch({ type: 'session/cleared' });
      return result; // surface the original 401, never loop
    }

    // Retry exactly once with the (still-valid, sid-bound) CSRF token.
    result = await rawBaseQuery(decorate(args, scoped, context), api, extraOptions);
  }

  // A mutation rejected for a stale/rotated CSRF token: drop the cache, re-prime
  // from GET /auth/csrf, and retry exactly once (never loops).
  if (mutating && isCsrfInvalid(result.error)) {
    clearCsrfToken();
    await ensureCsrfToken();
    result = await rawBaseQuery(decorate(args, scoped, context), api, extraOptions);
  }

  return result;
};
