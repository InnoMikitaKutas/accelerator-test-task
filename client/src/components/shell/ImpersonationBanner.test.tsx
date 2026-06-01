import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { makeStore } from '@/app/store';
import { setSession } from '@/features/session/sessionSlice';
import type { SessionUser } from '@/types/api';
import { ImpersonationBanner } from './ImpersonationBanner';

function impersonating(minutesLeft: number): SessionUser {
  return {
    id: 'target',
    role: 'PLAYER',
    email: 'jordan@club.com',
    firstName: 'Jordan',
    lastName: 'Lee',
    emailVerified: true,
    mustChangePassword: false,
    impersonatedBy: {
      id: 'admin',
      email: 'admin@x.com',
      expiresAt: new Date(Date.now() + minutesLeft * 60_000).toISOString(),
    },
  };
}

describe('ImpersonationBanner (FR-015, H1)', () => {
  it('renders nothing when not impersonating', () => {
    const store = makeStore();
    store.dispatch(setSession({ ...impersonating(60), impersonatedBy: null }));
    renderWithProviders(<ImpersonationBanner />, { store });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the target, a ~1h countdown, and exits on click', async () => {
    const user = userEvent.setup();
    let exited = false;
    server.use(
      http.post(apiUrl('/impersonate/exit'), () => {
        exited = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const store = makeStore();
    store.dispatch(setSession(impersonating(60)));
    renderWithProviders(<ImpersonationBanner />, { store });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('acting as');
    expect(alert).toHaveTextContent('Jordan Lee');
    expect(screen.getByRole('timer').textContent).toMatch(/^\d{2}:\d{2}$/);

    await user.click(screen.getByRole('button', { name: 'Exit' }));
    await waitFor(() => expect(exited).toBe(true));
  });

  it('turns the countdown foul under 5 minutes', () => {
    const store = makeStore();
    store.dispatch(setSession(impersonating(4)));
    renderWithProviders(<ImpersonationBanner />, { store });
    expect(screen.getByRole('timer')).toHaveAttribute('data-tone', 'foul');
  });
});
