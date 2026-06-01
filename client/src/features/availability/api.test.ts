import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { makeStore } from '@/app/store';
import type { Paginated, TrainerAvailabilityRow } from '@/types/api';
import { availabilityApi } from './api';

const page: Paginated<TrainerAvailabilityRow> = {
  items: [
    { playerProfileId: 'p1', displayName: 'Ana Striker', slots: [{ dayOfWeek: 1, startTime: '17:00', endTime: '19:00' }] },
  ],
  nextCursor: null,
  hasMore: false,
};

describe('availabilityApi.trainerAvailability', () => {
  it('sends day/time/search filters to GET /trainer/availability', async () => {
    let url: URL | undefined;
    server.use(
      http.get(apiUrl('/trainer/availability'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(page);
      }),
    );
    const store = makeStore();

    const res = await store
      .dispatch(
        availabilityApi.endpoints.trainerAvailability.initiate({ dayOfWeek: 3, availableAt: '17:00', search: 'ana' }),
      )
      .unwrap();

    expect(res.items).toHaveLength(1);
    expect(url?.searchParams.get('dayOfWeek')).toBe('3');
    expect(url?.searchParams.get('availableAt')).toBe('17:00');
    expect(url?.searchParams.get('search')).toBe('ana');
    expect(url?.searchParams.get('limit')).toBe('25');
  });

  it('keeps dayOfWeek=0 (Sunday) rather than dropping it as falsy', async () => {
    let url: URL | undefined;
    server.use(
      http.get(apiUrl('/trainer/availability'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(page);
      }),
    );
    const store = makeStore();

    await store.dispatch(availabilityApi.endpoints.trainerAvailability.initiate({ dayOfWeek: 0 })).unwrap();

    expect(url?.searchParams.get('dayOfWeek')).toBe('0');
  });

  it('omits unset filters from the query string', async () => {
    let url: URL | undefined;
    server.use(
      http.get(apiUrl('/trainer/availability'), ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json(page);
      }),
    );
    const store = makeStore();

    await store.dispatch(availabilityApi.endpoints.trainerAvailability.initiate({})).unwrap();

    expect(url?.searchParams.has('dayOfWeek')).toBe(false);
    expect(url?.searchParams.has('availableAt')).toBe(false);
    expect(url?.searchParams.has('search')).toBe(false);
  });
});
