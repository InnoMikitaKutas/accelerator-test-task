import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/app/store';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { SessionUser } from '@/types/api';
import App from './App';

/**
 * Router-level happy-path E2E (Task 10.4): the full integration the unit tests can't
 * see on their own — GET /auth/me 401 → login screen → submit → session set → router
 * lands on the guarded RequireAuth → AppShell with the role-filtered rail nav.
 *
 * The remaining Epic-01 matrix behaviors are each proven at the component layer:
 *   H2 deactivate sign-out copy → users/* tests · L7 verify banner → auth tests ·
 *   M1 unique-link reject → JoinLanding tests · L2/M3 approvals EXPIRED → family tests ·
 *   L5 override trimmed reason → ConflictOverrideModal test · H1 impersonation →
 *   UsersDirectory + ImpersonationBanner tests · branding preview/save → BrandingSettings test.
 */
const trainer: SessionUser = {
  id: 'tr1',
  role: 'TRAINER',
  email: 'tess@club.com',
  firstName: 'Tess',
  lastName: 'Trainer',
  emailVerified: true,
  mustChangePassword: false,
};

describe('E2E — auth happy path (login → guarded shell)', () => {
  it('logs a trainer in and lands them in the role-aware shell', async () => {
    server.use(
      http.get(apiUrl('/auth/me'), () => HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 })),
      http.post(apiUrl('/auth/refresh'), () =>
        HttpResponse.json({ errorCode: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
      http.post(apiUrl('/auth/login'), () => HttpResponse.json(trainer)),
    );
    const user = userEvent.setup();
    render(
      <Provider store={makeStore()}>
        <App />
      </Provider>,
    );

    // Unauthenticated → login screen.
    await screen.findByRole('heading', { name: /log in/i });
    // Required FormField labels carry a " *", and a Show/Hide-password button also
    // matches /password/ — so use a regex for email and scope password to the input.
    await user.type(screen.getByLabelText(/email/i), 'tess@club.com');
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    // Authenticated → role-aware shell: the primary rail nav + the landing render,
    // and the nav is role-filtered to trainer destinations.
    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByText(/welcome, tess trainer/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Branding' })).toBeInTheDocument();
  });
});
