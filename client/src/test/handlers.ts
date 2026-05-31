import { http, HttpResponse, type RequestHandler } from 'msw';

/**
 * Base REST origin for mocks — matches the test env in vite.config.ts so MSW
 * handlers line up with what RTK Query's baseQuery actually requests.
 */
export const API_URL = 'http://localhost:3000/api/v1';

/** Build an absolute mock URL: apiUrl('/auth/me') → http://localhost:3000/api/v1/auth/me */
export const apiUrl = (path: string) => `${API_URL}${path}`;

/** The CSRF token the default GET /auth/csrf handler returns; assertable in tests. */
export const CSRF_TOKEN = 'test-csrf-token';

/**
 * Default handlers are otherwise intentionally empty — each test registers exactly
 * the handlers it needs via `server.use(...)`, and unhandled requests error (see
 * setup.ts) so a missing mock is caught loudly rather than silently hitting the
 * network.
 *
 * The one global default is GET /auth/csrf: baseQuery fetches a CSRF token from it
 * before every mutation (the `csrf` cookie is HttpOnly — F-4), so every flow that
 * mutates needs it. Tests that assert a specific token or count fetches override it
 * via `server.use(...)`.
 */
export const handlers: RequestHandler[] = [
  http.get(apiUrl('/auth/csrf'), () => HttpResponse.json({ csrfToken: CSRF_TOKEN })),
];
