import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { ForcedPasswordChange } from './ForcedPasswordChange';

function renderForced() {
  return renderWithProviders(
    <Routes>
      <Route path="/forced-password-change" element={<ForcedPasswordChange />} />
      <Route path="/" element={<div>Dashboard stub</div>} />
    </Routes>,
    { initialEntries: ['/forced-password-change'] },
  );
}

describe('ForcedPasswordChange', () => {
  it('changes the temp password and lands on the dashboard', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post(apiUrl('/auth/password/change'), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderForced();

    await user.type(screen.getByLabelText(/^new password/i), 'Strongpass1');
    await user.type(screen.getByLabelText(/^confirm new password/i), 'Strongpass1');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByText('Dashboard stub')).toBeInTheDocument();
    // Forced flow omits currentPassword and flags the temp-password path (FR-005).
    expect(body).toEqual({ newPassword: 'Strongpass1', fromTempPassword: true });
  });

  it('enforces the password rules client-side', async () => {
    const user = userEvent.setup();
    renderForced();

    await user.type(screen.getByLabelText(/^new password/i), 'short');
    await user.type(screen.getByLabelText(/^confirm new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByText(/use at least 8 characters/i)).toBeInTheDocument();
    expect(screen.queryByText('Dashboard stub')).not.toBeInTheDocument();
  });
});
