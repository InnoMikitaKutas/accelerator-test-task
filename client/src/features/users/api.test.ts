import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { makeStore } from '@/app/store';
import { parseApiError } from '@/services/apiError';
import type { Paginated, UserResponse } from '@/types/api';
import { usersApi } from './api';

const trainer: UserResponse = {
  id: 't1',
  email: 'coach@club.com',
  firstName: 'Casey',
  lastName: 'Coach',
  role: 'TRAINER',
  status: 'ACTIVE',
  emailVerified: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('usersApi', () => {
  it('lists users with the keyset filters as query params', async () => {
    let url: URL | undefined;
    const page: Paginated<UserResponse> = { items: [trainer], nextCursor: 'c1', hasMore: true };
    server.use(
      http.get(apiUrl('/users'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(page);
      }),
    );
    const store = makeStore();

    const res = await store
      .dispatch(usersApi.endpoints.listUsers.initiate({ role: 'TRAINER', status: 'ACTIVE', search: 'cas' }))
      .unwrap();

    expect(res.items).toHaveLength(1);
    expect(url?.searchParams.get('role')).toBe('TRAINER');
    expect(url?.searchParams.get('status')).toBe('ACTIVE');
    expect(url?.searchParams.get('search')).toBe('cas');
  });

  it('surfaces EMAIL_EXISTS from create-trainer', async () => {
    server.use(
      http.post(apiUrl('/users'), () =>
        HttpResponse.json({ errorCode: 'EMAIL_EXISTS' }, { status: 409 }),
      ),
    );
    const store = makeStore();

    const err = await store
      .dispatch(
        usersApi.endpoints.createTrainer.initiate({
          email: 'dupe@club.com',
          firstName: 'A',
          lastName: 'B',
          businessName: 'Org',
        }),
      )
      .unwrap()
      .catch((e) => e);

    expect(parseApiError(err).errorCode).toBe('EMAIL_EXISTS');
  });

  it('deactivate returns the user as INACTIVE', async () => {
    server.use(
      http.post(apiUrl('/users/t1/deactivate'), () =>
        HttpResponse.json({ ...trainer, status: 'INACTIVE' }),
      ),
    );
    const store = makeStore();

    const res = await store
      .dispatch(usersApi.endpoints.deactivateUser.initiate({ id: 't1', reason: 'left club' }))
      .unwrap();

    expect(res.status).toBe('INACTIVE');
  });

  it('gdpr delete returns the anonymization result', async () => {
    server.use(
      http.delete(apiUrl('/users/t1'), () =>
        HttpResponse.json({ anonymized: true, deletionLogId: 'log1', historyRetained: true }),
      ),
    );
    const store = makeStore();

    const res = await store
      .dispatch(
        usersApi.endpoints.gdprDeleteUser.initiate({
          id: 't1',
          body: { reason: 'request', confirmEmail: 'coach@club.com' },
        }),
      )
      .unwrap();

    expect(res).toMatchObject({ anonymized: true, deletionLogId: 'log1' });
  });
});
