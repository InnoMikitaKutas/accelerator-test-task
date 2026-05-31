import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ImpersonationLog, Paginated } from '@/types/api';
import { ImpersonationHistory } from './ImpersonationHistory';

const log = (over: Partial<ImpersonationLog> & Pick<ImpersonationLog, 'id'>): ImpersonationLog => ({
  adminId: 'a1',
  adminEmail: 'admin@x.com',
  targetUserId: 't1',
  targetEmail: 'target@x.com',
  startedAt: '2026-05-30T10:00:00Z',
  endedAt: '2026-05-30T10:30:00Z',
  durationSec: 1800,
  ...over,
});

describe('ImpersonationHistory (FR-016)', () => {
  it('renders rows with duration and an ACTIVE badge for open sessions', async () => {
    const body: Paginated<ImpersonationLog> = {
      items: [log({ id: 'l1' }), log({ id: 'l2', endedAt: null, durationSec: null })],
      nextCursor: null,
      hasMore: false,
    };
    server.use(http.get(apiUrl('/impersonation/history'), () => HttpResponse.json(body)));
    renderWithProviders(<ImpersonationHistory />);

    expect(await screen.findAllByText('admin@x.com')).toHaveLength(2);
    expect(screen.getByText('30m 00s')).toBeInTheDocument(); // closed session duration
    expect(screen.getByText('ACTIVE')).toBeInTheDocument(); // open session badge
  });

  it('refetches with the date filter as a query param', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(apiUrl('/impersonation/history'), ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json({ items: [log({ id: 'l1' })], nextCursor: null, hasMore: false });
      }),
    );
    renderWithProviders(<ImpersonationHistory />);

    await screen.findByText('target@x.com');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-05-01' } });

    await waitFor(() => expect(lastUrl?.searchParams.get('from')).toBe('2026-05-01'));
  });
});
