import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { VerifyEmail } from './VerifyEmail';

describe('VerifyEmail', () => {
  it('auto-submits the link token and confirms on success', async () => {
    server.use(http.post(apiUrl('/auth/verify-email'), () => HttpResponse.json({ verified: true })));
    renderWithProviders(<VerifyEmail />, { initialEntries: ['/verify-email?token=good-token-value'] });

    expect(await screen.findByRole('heading', { name: /email verified/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to login/i })).toBeInTheDocument();
  });

  it('offers a resend form when the token has expired', async () => {
    const user = userEvent.setup();
    let resendEmail: string | undefined;
    server.use(
      http.post(apiUrl('/auth/verify-email'), () =>
        HttpResponse.json({ errorCode: 'TOKEN_EXPIRED' }, { status: 410 }),
      ),
      http.post(apiUrl('/auth/resend-verification'), async ({ request }) => {
        resendEmail = ((await request.json()) as { email: string }).email;
        return new HttpResponse(null, { status: 202 });
      }),
    );
    renderWithProviders(<VerifyEmail />, { initialEntries: ['/verify-email?token=expired-token-value'] });

    expect(await screen.findByText(/this verification link has expired/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^email/i), 'dana@x.com');
    await user.click(screen.getByRole('button', { name: /resend verification link/i }));

    expect(await screen.findByText(/a new link is on its way/i)).toBeInTheDocument();
    expect(resendEmail).toBe('dana@x.com');
  });

  it('treats an already-consumed token as "already verified"', async () => {
    server.use(
      http.post(apiUrl('/auth/verify-email'), () =>
        HttpResponse.json({ errorCode: 'TOKEN_USED' }, { status: 410 }),
      ),
    );
    renderWithProviders(<VerifyEmail />, { initialEntries: ['/verify-email?token=used-token-value'] });

    expect(await screen.findByRole('heading', { name: /already verified/i })).toBeInTheDocument();
  });

  it('shows an invalid state (and never calls the API) without a token', async () => {
    // No handler registered — a request would fail the test (onUnhandledRequest:error).
    renderWithProviders(<VerifyEmail />, { initialEntries: ['/verify-email'] });

    expect(await screen.findByText(/invalid or incomplete/i)).toBeInTheDocument();
  });
});
