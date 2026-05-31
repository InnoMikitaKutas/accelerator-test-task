import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { TrainerAvailabilityRow } from '@/types/api';
import { TrainerAvailabilityView } from './TrainerAvailabilityView';

const ana: TrainerAvailabilityRow = {
  playerProfileId: 'p1',
  displayName: 'Ana Striker',
  slots: [
    { dayOfWeek: 1, startTime: '17:00', endTime: '19:00' },
    { dayOfWeek: 3, startTime: '18:00', endTime: '20:00' },
  ],
};
const ben: TrainerAvailabilityRow = {
  playerProfileId: 'p2',
  displayName: 'Ben Keeper',
  slots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }],
};

/**
 * One handler that branches on the filters, so the SAME endpoint narrows its
 * result set as the UI changes filters — mirroring the real server behavior.
 * Captures the last requested URL for param assertions.
 */
function availabilityHandler(onUrl?: (u: URL) => void) {
  return http.get(apiUrl('/trainer/availability'), ({ request }) => {
    const url = new URL(request.url);
    onUrl?.(url);
    const day = url.searchParams.get('dayOfWeek');
    // Only Ana has a Wednesday (3) slot, so a Wednesday filter narrows to her.
    const items = day === '3' ? [ana] : [ana, ben];
    return HttpResponse.json({ items, nextCursor: null, hasMore: false });
  });
}

describe('TrainerAvailabilityView (FR-034)', () => {
  it('renders the heatmap from trainerView with an advisory note', async () => {
    server.use(availabilityHandler());
    renderWithProviders(<TrainerAvailabilityView />);

    expect(await screen.findByText('Ana Striker')).toBeInTheDocument();
    expect(screen.getByText('Ben Keeper')).toBeInTheDocument();
    // The across-players density row and BR-012 advisory framing are present.
    expect(screen.getByText('Players free')).toBeInTheDocument();
    expect(screen.getByText(/advisory only/i)).toBeInTheDocument();
    // Each player's slots are reachable to a screen reader, day by day.
    expect(screen.getByText('Ana Striker available Monday, 1 slot')).toBeInTheDocument();
    expect(screen.getByText('Ana Striker available Wednesday, 1 slot')).toBeInTheDocument();
  });

  it('narrows the list when a day filter is applied (and sends dayOfWeek)', async () => {
    let lastUrl: URL | undefined;
    server.use(availabilityHandler((u) => (lastUrl = u)));
    const user = userEvent.setup();
    renderWithProviders(<TrainerAvailabilityView />);

    expect(await screen.findByText('Ben Keeper')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Day'), '3'); // Wednesday

    // The filter resets the keyset list (brief skeleton) and refetches; wait until the
    // narrowed result has settled — Ben dropped out, Ana still present.
    await waitFor(() => {
      expect(screen.queryByText('Ben Keeper')).not.toBeInTheDocument();
      expect(screen.queryByText('Ana Striker')).toBeInTheDocument();
    });
    expect(lastUrl?.searchParams.get('dayOfWeek')).toBe('3');
    // Active-filter chip reflects the narrowing.
    expect(screen.getByRole('button', { name: 'Clear day filter' })).toBeInTheDocument();
  });

  it('sends the available-at filter as a query param', async () => {
    let lastUrl: URL | undefined;
    server.use(availabilityHandler((u) => (lastUrl = u)));
    renderWithProviders(<TrainerAvailabilityView />);

    await screen.findByText('Ana Striker');
    // type="time" inputs are set reliably via a change event rather than keystrokes.
    fireEvent.change(screen.getByLabelText('Available at/after'), { target: { value: '17:00' } });

    await waitFor(() => expect(lastUrl?.searchParams.get('availableAt')).toBe('17:00'));
  });

  it('shows an empty state when no players match', async () => {
    server.use(
      http.get(apiUrl('/trainer/availability'), () =>
        HttpResponse.json({ items: [], nextCursor: null, hasMore: false }),
      ),
    );
    renderWithProviders(<TrainerAvailabilityView />);

    expect(await screen.findByText('No players match')).toBeInTheDocument();
  });
});
