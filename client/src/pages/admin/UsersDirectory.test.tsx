import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { Paginated, UserResponse } from '@/types/api';
import { UsersDirectory } from './UsersDirectory';

function mkUser(over: Partial<UserResponse> & Pick<UserResponse, 'id'>): UserResponse {
  return {
    email: `${over.id}@x.com`,
    firstName: 'First',
    lastName: 'Last',
    role: 'PLAYER',
    status: 'ACTIVE',
    emailVerified: true,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const page = (items: UserResponse[], nextCursor: string | null = null): Paginated<UserResponse> => ({
  items,
  nextCursor,
  hasMore: nextCursor != null,
});

describe('UsersDirectory', () => {
  it('renders rows with status badges incl. DELETED strikethrough', async () => {
    const users = [
      mkUser({ id: 'u1', firstName: 'Alice', lastName: 'Active', status: 'ACTIVE' }),
      mkUser({ id: 'u2', firstName: 'Ian', lastName: 'Inactive', status: 'INACTIVE' }),
      mkUser({ id: 'u4', firstName: 'Deleted', lastName: 'User', status: 'DELETED' }),
    ];
    server.use(http.get(apiUrl('/users'), () => HttpResponse.json(page(users))));
    renderWithProviders(<UsersDirectory />);

    // Scope to rows — the status <select> options share the ACTIVE/INACTIVE/DELETED text.
    const aliceRow = await screen.findByRole('row', { name: /alice active/i });
    expect(within(aliceRow).getByText('ACTIVE')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /ian inactive/i })).getByText('INACTIVE')).toBeInTheDocument();
    const deletedRow = screen.getByRole('row', { name: /deleted user/i });
    expect(within(deletedRow).getByText('DELETED')).toBeInTheDocument();
    expect(within(deletedRow).getByText('Deleted User').className).toMatch(/struck/);
  });

  it('appends the next page, passing the opaque cursor back verbatim', async () => {
    const cursors: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/users'), ({ request }) => {
        const c = new URL(request.url).searchParams.get('cursor');
        cursors.push(c);
        return c
          ? HttpResponse.json(page([mkUser({ id: 'u3', firstName: 'Cara', lastName: 'Coach' })]))
          : HttpResponse.json(page([mkUser({ id: 'u1', firstName: 'Alice', lastName: 'Active' })], 'CURSOR_2'));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersDirectory />);

    await screen.findByText('Alice Active');
    await user.click(screen.getByRole('button', { name: /load more/i }));

    expect(await screen.findByText('Cara Coach')).toBeInTheDocument();
    expect(cursors).toContain('CURSOR_2');
  });

  it('refetches with the selected status filter', async () => {
    const seen: string[] = [];
    server.use(
      http.get(apiUrl('/users'), ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('status') ?? '');
        return HttpResponse.json(page([mkUser({ id: 'u1', firstName: 'Alice', lastName: 'Active' })]));
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersDirectory />);

    await screen.findByText('Alice Active');
    await user.selectOptions(screen.getByLabelText('Status'), 'INACTIVE');

    await waitFor(() => expect(seen).toContain('INACTIVE'));
  });

  it('deactivates a user with the force-logout copy (H2) and flips the row', async () => {
    const u1 = mkUser({ id: 'u1', firstName: 'Alice', lastName: 'Active', role: 'TRAINER', status: 'ACTIVE' });
    server.use(
      http.get(apiUrl('/users'), () => HttpResponse.json(page([u1]))),
      http.post(apiUrl('/users/u1/deactivate'), () => HttpResponse.json({ ...u1, status: 'INACTIVE' })),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersDirectory />);

    await screen.findByText('Alice Active');
    await user.click(screen.getByRole('button', { name: /actions for alice active/i }));
    await user.click(screen.getByRole('menuitem', { name: /deactivate/i }));

    expect(await screen.findByText(/signs the user out of all sessions immediately/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    const row = await screen.findByRole('row', { name: /alice active/i });
    await waitFor(() => expect(within(row).getByText('INACTIVE')).toBeInTheDocument());
  });

  it('gates GDPR delete on reason + typed email, then marks the row DELETED', async () => {
    const u1 = mkUser({ id: 'u1', firstName: 'Alice', lastName: 'Active', email: 'alice@x.com', status: 'ACTIVE' });
    server.use(
      http.get(apiUrl('/users'), () => HttpResponse.json(page([u1]))),
      http.delete(apiUrl('/users/u1'), () =>
        HttpResponse.json({ anonymized: true, deletionLogId: 'log1', historyRetained: true }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersDirectory />);

    await screen.findByText('Alice Active');
    await user.click(screen.getByRole('button', { name: /actions for alice active/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete \(gdpr\)/i }));

    const confirm = await screen.findByRole('button', { name: /delete permanently/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/reason/i), 'User requested erasure');
    await user.type(screen.getByLabelText(/type .* to confirm/i), 'wrong@x.com');
    expect(confirm).toBeDisabled();

    await user.clear(screen.getByLabelText(/type .* to confirm/i));
    await user.type(screen.getByLabelText(/type .* to confirm/i), 'alice@x.com');
    expect(confirm).toBeEnabled();

    await user.click(confirm);

    const deletedRow = await screen.findByRole('row', { name: /deleted user/i });
    expect(within(deletedRow).getByText('Deleted User').className).toMatch(/struck/);
    expect(within(deletedRow).getByText('DELETED')).toBeInTheDocument();
  });

  it('reactivates an inactive user', async () => {
    const u2 = mkUser({ id: 'u2', firstName: 'Ian', lastName: 'Inactive', status: 'INACTIVE' });
    server.use(
      http.get(apiUrl('/users'), () => HttpResponse.json(page([u2]))),
      http.post(apiUrl('/users/u2/reactivate'), () => HttpResponse.json({ ...u2, status: 'ACTIVE' })),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersDirectory />);

    await screen.findByText('Ian Inactive');
    await user.click(screen.getByRole('button', { name: /actions for ian inactive/i }));
    await user.click(screen.getByRole('menuitem', { name: /reactivate/i }));

    const row = await screen.findByRole('row', { name: /ian inactive/i });
    await waitFor(() => expect(within(row).getByText('ACTIVE')).toBeInTheDocument());
  });

  it('starts impersonation from the row menu (FR-015)', async () => {
    let posted = false;
    const u1 = mkUser({ id: 'u1', firstName: 'Pat', lastName: 'Player', role: 'PLAYER', status: 'ACTIVE' });
    server.use(
      http.get(apiUrl('/users'), () => HttpResponse.json(page([u1]))),
      http.post(apiUrl('/impersonate/u1'), () => {
        posted = true;
        return HttpResponse.json({
          impersonating: true,
          targetUserId: 'u1',
          targetDisplayName: 'Pat Player',
          expiresAt: '2026-05-31T01:00:00Z',
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersDirectory />);

    await screen.findByText('Pat Player');
    await user.click(screen.getByRole('button', { name: /actions for pat player/i }));
    await user.click(screen.getByRole('menuitem', { name: /^impersonate$/i }));

    await waitFor(() => expect(posted).toBe(true));
    // Flush the post-await busy reset inside act (the row clears its aria-busy).
    await waitFor(() => expect(screen.getByRole('row', { name: /pat player/i })).not.toHaveAttribute('aria-busy'));
  });

  it('does not offer Impersonate for super admins (BR-009)', async () => {
    const admin = mkUser({ id: 'a1', firstName: 'Sam', lastName: 'Super', role: 'SUPER_ADMIN', status: 'ACTIVE' });
    server.use(http.get(apiUrl('/users'), () => HttpResponse.json(page([admin]))));
    const user = userEvent.setup();
    renderWithProviders(<UsersDirectory />);

    await screen.findByText('Sam Super');
    await user.click(screen.getByRole('button', { name: /actions for sam super/i }));
    expect(screen.queryByRole('menuitem', { name: /^impersonate$/i })).not.toBeInTheDocument();
  });
});
