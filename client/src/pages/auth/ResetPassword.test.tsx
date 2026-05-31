import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { ResetPassword } from './ResetPassword';

const TOKEN_ENTRY = ['/reset-password?token=reset-token-value-1234'];

async function fillNewPassword(user: ReturnType<typeof userEvent.setup>, pw: string, confirm = pw) {
  await user.type(screen.getByLabelText(/^new password/i), pw);
  await user.type(screen.getByLabelText(/^confirm new password/i), confirm);
}

describe('ResetPassword', () => {
  it('resets the password and offers a path to login', async () => {
    const user = userEvent.setup();
    server.use(http.post(apiUrl('/auth/password/reset'), () => HttpResponse.json({ reset: true })));
    renderWithProviders(<ResetPassword />, { initialEntries: TOKEN_ENTRY });

    await fillNewPassword(user, 'Strongpass1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('heading', { name: /password updated/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to login/i })).toBeInTheDocument();
  });

  it('shows a request-again state when the token is expired', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/auth/password/reset'), () =>
        HttpResponse.json({ errorCode: 'TOKEN_EXPIRED' }, { status: 410 }),
      ),
    );
    renderWithProviders(<ResetPassword />, { initialEntries: TOKEN_ENTRY });

    await fillNewPassword(user, 'Strongpass1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('heading', { name: /can't be used/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toBeInTheDocument();
  });

  it('blocks mismatched confirmation client-side without hitting the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPassword />, { initialEntries: TOKEN_ENTRY });

    await fillNewPassword(user, 'Strongpass1', 'Different1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('renders the request-again state immediately when no token is present', async () => {
    renderWithProviders(<ResetPassword />, { initialEntries: ['/reset-password'] });

    expect(await screen.findByRole('heading', { name: /can't be used/i })).toBeInTheDocument();
  });
});
