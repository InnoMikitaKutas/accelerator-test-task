import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { ForgotPassword } from './ForgotPassword';

describe('ForgotPassword', () => {
  it('shows the same confirmation on success (202)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/auth/password/forgot'), () => new HttpResponse(null, { status: 202 })),
    );
    renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] });

    await user.type(screen.getByLabelText(/^email/i), 'dana@x.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });

  it('still confirms even if the server errors (no account enumeration)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/auth/password/forgot'), () =>
        HttpResponse.json({ errorCode: 'INTERNAL' }, { status: 500 }),
      ),
    );
    renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] });

    await user.type(screen.getByLabelText(/^email/i), 'nobody@x.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });
});
