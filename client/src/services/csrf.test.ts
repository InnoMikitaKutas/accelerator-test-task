import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiUrl, CSRF_TOKEN } from '@/test/handlers';
import { ensureCsrfToken, getCsrfToken, clearCsrfToken } from './csrf';

// The token is cached in module scope; reset it between tests for isolation.
beforeEach(clearCsrfToken);
afterEach(clearCsrfToken);

describe('CSRF token', () => {
  it('getCsrfToken is undefined until a token has been fetched', () => {
    expect(getCsrfToken()).toBeUndefined();
  });

  it('ensureCsrfToken fetches GET /auth/csrf and caches the token', async () => {
    const token = await ensureCsrfToken();
    expect(token).toBe(CSRF_TOKEN);
    expect(getCsrfToken()).toBe(CSRF_TOKEN);
  });

  it('reads the token from the response body, not the cookie', async () => {
    server.use(
      http.get(apiUrl('/auth/csrf'), () => HttpResponse.json({ csrfToken: 'from-body-xyz' })),
    );
    expect(await ensureCsrfToken()).toBe('from-body-xyz');
  });

  it('coalesces concurrent calls into a single fetch (single-flight)', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/auth/csrf'), () => {
        calls += 1;
        return HttpResponse.json({ csrfToken: 'tok' });
      }),
    );

    const [a, b, c] = await Promise.all([ensureCsrfToken(), ensureCsrfToken(), ensureCsrfToken()]);

    expect(calls).toBe(1);
    expect([a, b, c]).toEqual(['tok', 'tok', 'tok']);
  });

  it('does not refetch once cached', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/auth/csrf'), () => {
        calls += 1;
        return HttpResponse.json({ csrfToken: 'tok' });
      }),
    );

    await ensureCsrfToken();
    await ensureCsrfToken();

    expect(calls).toBe(1);
  });

  it('clearCsrfToken forces a refetch on the next ensure', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/auth/csrf'), () => {
        calls += 1;
        return HttpResponse.json({ csrfToken: `tok-${calls}` });
      }),
    );

    expect(await ensureCsrfToken()).toBe('tok-1');
    clearCsrfToken();
    expect(getCsrfToken()).toBeUndefined();
    expect(await ensureCsrfToken()).toBe('tok-2');
    expect(calls).toBe(2);
  });

  it('resolves to undefined (no throw) when the endpoint fails', async () => {
    server.use(http.get(apiUrl('/auth/csrf'), () => new HttpResponse(null, { status: 500 })));
    expect(await ensureCsrfToken()).toBeUndefined();
    expect(getCsrfToken()).toBeUndefined();
  });
});
