import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ContextsResponse } from '@/types/api';
import { ChildModeShell } from './ChildModeShell';

const contexts: ContextsResponse = {
  subjects: [
    {
      profileId: 'me1',
      displayName: 'Sam',
      isSelf: true,
      isChild: true,
      trainers: [{ trainerId: 't1', name: 'Club FC', status: 'active' }],
    },
  ],
  defaultContext: null,
};

describe('ChildModeShell (FR-025/026)', () => {
  it('shows lane-tabs and a locked, ask-a-grown-up action (no subject switcher)', async () => {
    server.use(http.get(apiUrl('/me/contexts'), () => HttpResponse.json(contexts)));
    renderWithProviders(<ChildModeShell />);

    expect(await screen.findByText('Your coaches')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Club FC' })).toBeInTheDocument();
    const addCoach = screen.getByRole('button', { name: /add a coach/i });
    expect(addCoach).toBeDisabled();
    expect(screen.getByText(/ask a grown-up to change/i)).toBeInTheDocument();
  });

  it('routes a purchase attempt to a parent approval', async () => {
    const user = userEvent.setup();
    let body: { childProfileId?: string; paymentType?: string } | undefined;
    server.use(
      http.get(apiUrl('/me/contexts'), () => HttpResponse.json(contexts)),
      http.post(apiUrl('/family/purchase-requests'), async ({ request }) => {
        body = (await request.json()) as { childProfileId?: string; paymentType?: string };
        return HttpResponse.json(
          {
            id: 'ap1',
            childProfileId: 'me1',
            childDisplayName: 'Sam',
            trainerId: 't1',
            itemRef: 'Session credit',
            paymentType: 'TOKEN',
            amount: null,
            status: 'PENDING',
            requestedAt: '2026-05-31T00:00:00Z',
            expiresAt: '2026-06-02T00:00:00Z',
            respondedAt: null,
            parentNote: null,
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<ChildModeShell />);

    await user.click(await screen.findByRole('tab', { name: 'Club FC' }));
    await user.click(screen.getByRole('button', { name: /ask to get this/i }));

    expect(await screen.findByText(/asked a grown-up to approve/i)).toBeInTheDocument();
    await waitFor(() => expect(body?.childProfileId).toBe('me1'));
    expect(body?.paymentType).toBe('TOKEN');
  });
});
