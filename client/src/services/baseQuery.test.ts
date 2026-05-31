import { http, HttpResponse } from 'msw';
import type { BaseQueryApi } from '@reduxjs/toolkit/query';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ContextRef } from '@/types/api';
import { baseQueryWithReauth } from './baseQuery';

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const eq = c.indexOf('=');
    const name = (eq > -1 ? c.slice(0, eq) : c).trim();
    if (name) document.cookie = `${name}=;max-age=0;path=/`;
  }
}

function makeApi(opts: { context?: ContextRef | null; type?: 'query' | 'mutation' } = {}) {
  const dispatch = vi.fn();
  // No `signal`: in jsdom, a constructed AbortSignal isn't an instance of the
  // Node AbortSignal that MSW's fetch interceptor validates. Leaving it undefined
  // lets fetch run without a signal (fine for these unit tests).
  const api = {
    abort: vi.fn(),
    dispatch,
    getState: () => ({ activeContext: { current: opts.context ?? null } }),
    extra: undefined,
    endpoint: 'test',
    type: opts.type ?? 'query',
    forced: false,
  } as unknown as BaseQueryApi;
  return { api, dispatch };
}

describe('baseQueryWithReauth', () => {
  beforeEach(clearCookies);
  afterEach(clearCookies);

  it('sends X-CSRF-Token on mutating methods but not on GET', async () => {
    document.cookie = 'csrf=tok-123';
    let getCsrf: string | null = 'unset';
    let postCsrf: string | null = null;
    server.use(
      http.get(apiUrl('/thing'), ({ request }) => {
        getCsrf = request.headers.get('x-csrf-token');
        return HttpResponse.json({ ok: true });
      }),
      http.post(apiUrl('/thing'), ({ request }) => {
        postCsrf = request.headers.get('x-csrf-token');
        return HttpResponse.json({ ok: true });
      }),
    );

    await baseQueryWithReauth('/thing', makeApi({ type: 'query' }).api, {});
    await baseQueryWithReauth({ url: '/thing', method: 'POST' }, makeApi({ type: 'mutation' }).api, {});

    expect(getCsrf).toBeNull();
    expect(postCsrf).toBe('tok-123');
  });

  it('sends X-Active-Context only on scoped endpoints', async () => {
    let scopedCtx: string | null = null;
    let plainCtx: string | null = 'unset';
    server.use(
      http.get(apiUrl('/scoped'), ({ request }) => {
        scopedCtx = request.headers.get('x-active-context');
        return HttpResponse.json({});
      }),
      http.get(apiUrl('/plain'), ({ request }) => {
        plainCtx = request.headers.get('x-active-context');
        return HttpResponse.json({});
      }),
    );
    const context: ContextRef = { subjectProfileId: 'sub-1', trainerId: 'tr-9' };

    await baseQueryWithReauth('/scoped', makeApi({ context }).api, { scoped: true });
    await baseQueryWithReauth('/plain', makeApi({ context }).api, {});

    expect(scopedCtx).toBe('sub-1:tr-9');
    expect(plainCtx).toBeNull();
  });

  it('refreshes once on 401 then retries the original successfully', async () => {
    let thingCalls = 0;
    let refreshCalls = 0;
    server.use(
      http.get(apiUrl('/thing'), () => {
        thingCalls += 1;
        return thingCalls === 1
          ? HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 })
          : HttpResponse.json({ ok: true });
      }),
      http.post(apiUrl('/auth/refresh'), () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await baseQueryWithReauth('/thing', makeApi().api, {});

    expect(refreshCalls).toBe(1);
    expect(thingCalls).toBe(2);
    expect(result.data).toEqual({ ok: true });
  });

  it('clears the session and does not loop when refresh also 401s (H2)', async () => {
    server.use(
      http.get(apiUrl('/thing'), () =>
        HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(apiUrl('/auth/refresh'), () =>
        HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );

    const { api, dispatch } = makeApi();
    const result = await baseQueryWithReauth('/thing', api, {});

    expect(result.error?.status).toBe(401);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'session/cleared' }));
  });

  it('does not refresh on a 401 that is not UNAUTHENTICATED (e.g. bad login)', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        HttpResponse.json({ errorCode: 'INVALID_CREDENTIALS' }, { status: 401 }),
      ),
      http.post(apiUrl('/auth/refresh'), () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { dispatch } = makeApi({ type: 'mutation' });
    const result = await baseQueryWithReauth(
      { url: '/auth/login', method: 'POST' },
      makeApi({ type: 'mutation' }).api,
      {},
    );

    expect(refreshCalls).toBe(0);
    expect(result.error?.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('coalesces concurrent 401s into a single refresh (single-flight)', async () => {
    let thingCalls = 0;
    let refreshCalls = 0;
    server.use(
      http.get(apiUrl('/thing'), () => {
        thingCalls += 1;
        return thingCalls <= 2
          ? HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 })
          : HttpResponse.json({ ok: true });
      }),
      http.post(apiUrl('/auth/refresh'), () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const [r1, r2] = await Promise.all([
      baseQueryWithReauth('/thing', makeApi().api, {}),
      baseQueryWithReauth('/thing', makeApi().api, {}),
    ]);

    expect(refreshCalls).toBe(1);
    expect(r1.data).toEqual({ ok: true });
    expect(r2.data).toEqual({ ok: true });
  });
});
