import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ChildSummary } from '@/types/api';
import { AssociationsManager } from './AssociationsManager';

const child: ChildSummary = {
  profileId: 'kid1',
  firstName: 'Kid',
  lastName: 'Parent',
  age: 9,
  gender: 'UNSPECIFIED',
  hasLogin: false,
  allowTokenWithoutApproval: false,
  trainers: [{ trainerId: 't1', name: 'Club FC' }],
};

const noop = () => undefined;

describe('AssociationsManager (FR-023)', () => {
  it('adds a connection by code', async () => {
    const user = userEvent.setup();
    let body: { code?: string } | undefined;
    server.use(
      http.post(apiUrl('/family/children/kid1/trainers'), async ({ request }) => {
        body = (await request.json()) as { code?: string };
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderWithProviders(<AssociationsManager open child={child} onClose={noop} />);

    await user.type(screen.getByLabelText(/add a coach/i), 'XY99');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(body).toEqual({ code: 'XY99' }));
  });

  it('removes a connection after warning about cancelled RSVPs', async () => {
    const user = userEvent.setup();
    let removed = false;
    server.use(
      http.delete(apiUrl('/family/children/kid1/trainers/t1'), () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<AssociationsManager open child={child} onClose={noop} />);

    await user.click(screen.getByRole('button', { name: /remove club fc/i }));
    expect(await screen.findByText(/upcoming rsvps .* cancelled/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove connection/i }));

    await waitFor(() => expect(removed).toBe(true));
  });
});
