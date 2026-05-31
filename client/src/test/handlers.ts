import type { RequestHandler } from 'msw';

/**
 * Base REST origin for mocks — matches the test env in vite.config.ts so MSW
 * handlers line up with what RTK Query's baseQuery actually requests.
 */
export const API_URL = 'http://localhost:3000/api/v1';

/** Build an absolute mock URL: apiUrl('/auth/me') → http://localhost:3000/api/v1/auth/me */
export const apiUrl = (path: string) => `${API_URL}${path}`;

/**
 * Default handlers are intentionally empty — each test registers exactly the
 * handlers it needs via `server.use(...)`, and unhandled requests error (see
 * setup.ts) so a missing mock is caught loudly rather than silently hitting the
 * network.
 */
export const handlers: RequestHandler[] = [];
