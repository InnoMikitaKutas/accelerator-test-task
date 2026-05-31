import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { makeStore } from '@/app/store';
import { setSession } from '@/features/session/sessionSlice';
import type { SessionUser } from '@/types/api';
import { parseApiError } from '@/services/apiError';
import { authApi } from './api';

const user: SessionUser = {
  id: 'u1',
  role: 'PLAYER',
  email: 'dana@x.com',
  firstName: 'Dana',
  lastName: 'L',
  emailVerified: true,
  mustChangePassword: false,
};

describe('authApi', () => {
  it('me hydrates the session slice on success', async () => {
    server.use(http.get(apiUrl('/auth/me'), () => HttpResponse.json(user)));
    const store = makeStore();

    await store.dispatch(authApi.endpoints.me.initiate());

    expect(store.getState().session.status).toBe('authenticated');
    expect(store.getState().session.user).toEqual(user);
  });

  it('me clears the session when not signed in (401 → refresh fails)', async () => {
    server.use(
      http.get(apiUrl('/auth/me'), () =>
        HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(apiUrl('/auth/refresh'), () =>
        HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );
    const store = makeStore();
    store.dispatch(setSession(user));

    await store.dispatch(authApi.endpoints.me.initiate());

    expect(store.getState().session.status).toBe('unauthenticated');
    expect(store.getState().session.user).toBeNull();
  });

  it('login stores the SessionUser principal', async () => {
    server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.json(user)));
    const store = makeStore();

    const result = await store
      .dispatch(authApi.endpoints.login.initiate({ email: 'dana@x.com', password: 'pw' }))
      .unwrap();

    expect(result).toEqual(user);
    expect(store.getState().session.user).toEqual(user);
  });

  it('logout clears the session', async () => {
    server.use(http.post(apiUrl('/auth/logout'), () => new HttpResponse(null, { status: 204 })));
    const store = makeStore();
    store.dispatch(setSession(user));

    await store.dispatch(authApi.endpoints.logout.initiate()).unwrap();

    expect(store.getState().session.user).toBeNull();
    expect(store.getState().session.status).toBe('unauthenticated');
  });

  it('folds the Retry-After header onto a RATE_LIMITED login error', async () => {
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        HttpResponse.json({ errorCode: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '42' } }),
      ),
    );
    const store = makeStore();

    const error = await store
      .dispatch(authApi.endpoints.login.initiate({ email: 'a@b.com', password: 'pw' }))
      .unwrap()
      .catch((e) => e);

    const parsed = parseApiError(error);
    expect(parsed.errorCode).toBe('RATE_LIMITED');
    expect(parsed.retryAfterSeconds).toBe(42);
  });
});
