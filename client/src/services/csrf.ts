/**
 * CSRF token management for the double-submit pattern (FR-009, F-4).
 *
 * The backend (`csrf-csrf`) keeps the `csrf` cookie **HttpOnly** and returns the
 * echoable token only in the body of `GET /auth/csrf` (`{ csrfToken }`). The value
 * stored in the cookie is a *hashed* binding of that token to the `csrf.sid`
 * cookie — so the token the client must echo can never be read from
 * `document.cookie`; it has to be fetched from the endpoint.
 *
 * We fetch it once, cache it in memory, and `baseQuery` echoes it as the
 * `X-CSRF-Token` header on every mutating request. The token is bound to the
 * stable per-browser `csrf.sid` cookie (decoupled from auth-token rotation), so a
 * single fetch stays valid across login/logout. On a `403 CSRF_INVALID` the cache
 * is cleared (`clearCsrfToken`) so the next mutation re-primes it.
 */
const CSRF_PATH = '/auth/csrf';

let token: string | undefined;
let inFlight: Promise<string | undefined> | null = null;

/** The cached CSRF token, or undefined if not yet fetched. Synchronous read for baseQuery. */
export function getCsrfToken(): string | undefined {
  return token;
}

/** Drop the cached token (e.g. after a 403 CSRF_INVALID) so it is re-fetched on next use. */
export function clearCsrfToken(): void {
  token = undefined;
  inFlight = null;
}

/**
 * Ensure a CSRF token is cached, fetching it from `GET /auth/csrf` if needed.
 * Concurrent callers share a single in-flight request (single-flight). Resolves to
 * the token, or `undefined` if the fetch failed — in which case the mutation
 * proceeds without the header and the server replies `403 CSRF_INVALID`, which
 * baseQuery surfaces to the caller.
 */
export async function ensureCsrfToken(): Promise<string | undefined> {
  if (token) return token;
  if (!inFlight) {
    inFlight = fetchCsrfToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function fetchCsrfToken(): Promise<string | undefined> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}${CSRF_PATH}`, {
      credentials: 'include',
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { csrfToken?: unknown };
    token = typeof data.csrfToken === 'string' ? data.csrfToken : undefined;
    return token;
  } catch {
    // Network/parse failure — leave the cache empty; the caller's mutation will
    // 403 and surface a normal error rather than throwing here.
    return undefined;
  }
}
