import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { SessionUser } from '@/types/api';
import { Login } from './Login';

const player: SessionUser = {
  id: 'u1',
  role: 'PLAYER',
  email: 'dana@x.com',
  firstName: 'Dana',
  lastName: 'L',
  emailVerified: true,
  mustChangePassword: false,
};

function renderLogin() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<div>Dashboard stub</div>} />
      <Route path="/forced-password-change" element={<div>Forced change stub</div>} />
    </Routes>,
    { initialEntries: ['/login'] },
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  // FormField appends an aria-hidden " *" to required labels — anchor to the start.
  await user.type(screen.getByLabelText(/^email/i), 'dana@x.com');
  await user.type(screen.getByLabelText(/^password/i), 'secret123');
  await user.click(screen.getByRole('button', { name: /log in/i }));
}

describe('Login', () => {
  it('signs in and routes to the dashboard, storing the principal', async () => {
    const user = userEvent.setup();
    server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.json(player)));
    const { store } = renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByText('Dashboard stub')).toBeInTheDocument();
    expect(store.getState().session.user).toEqual(player);
  });

  it('routes a temp-password user to the forced-change screen', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/auth/login'), () => HttpResponse.json({ ...player, mustChangePassword: true })),
    );
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByText('Forced change stub')).toBeInTheDocument();
  });

  it('shows a generic inline error for INVALID_CREDENTIALS', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        HttpResponse.json({ errorCode: 'INVALID_CREDENTIALS' }, { status: 401 }),
      ),
    );
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByText(/email or password is incorrect/i)).toBeInTheDocument();
  });

  it('distinguishes ACCOUNT_INACTIVE copy from invalid credentials (L3)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        HttpResponse.json({ errorCode: 'ACCOUNT_INACTIVE' }, { status: 403 }),
      ),
    );
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByText(/this account is inactive/i)).toBeInTheDocument();
    expect(screen.queryByText(/email or password is incorrect/i)).not.toBeInTheDocument();
  });

  it('offers Resend on EMAIL_NOT_VERIFIED and posts the resend request', async () => {
    const user = userEvent.setup();
    let resendEmail: string | undefined;
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        HttpResponse.json({ errorCode: 'EMAIL_NOT_VERIFIED', canResend: true }, { status: 403 }),
      ),
      http.post(apiUrl('/auth/resend-verification'), async ({ request }) => {
        resendEmail = ((await request.json()) as { email: string }).email;
        return new HttpResponse(null, { status: 202 });
      }),
    );
    renderLogin();

    await fillAndSubmit(user);
    await user.click(await screen.findByRole('button', { name: /resend verification/i }));

    expect(await screen.findByText(/verification email sent/i)).toBeInTheDocument();
    expect(resendEmail).toBe('dana@x.com');
  });

  it('disables the submit and shows a retry countdown on RATE_LIMITED', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        HttpResponse.json({ errorCode: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60' } }),
      ),
    );
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled();
  });

  it('validates required fields client-side without hitting the network', async () => {
    const user = userEvent.setup();
    renderLogin();

    // No login handler registered — a stray request would fail the test (onUnhandledRequest:error).
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });
});
