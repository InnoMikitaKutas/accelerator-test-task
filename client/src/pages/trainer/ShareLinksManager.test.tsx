import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ShareLink } from '@/types/api';
import { ShareLinksManager } from './ShareLinksManager';

const staticLink: ShareLink = {
  id: 's1',
  type: 'static',
  url: 'https://app.example/join/AB12CD',
  code: 'AB12CD',
  targetEmail: null,
  expiresAt: null,
  useCount: 4,
  maxUses: null,
  status: 'ACTIVE',
  active: true,
  createdAt: '2026-05-20T00:00:00Z',
};

const invite: ShareLink = {
  id: 'inv1',
  type: 'unique',
  url: 'https://app.example/join/ZZ99',
  code: 'ZZ99',
  targetEmail: 'existing@club.com',
  expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  useCount: 0,
  maxUses: 1,
  status: 'PENDING',
  active: true,
  createdAt: '2026-05-29T00:00:00Z',
};

/** One GET /sharelinks handler that branches on the `type` query param. */
function listHandler(invites: ShareLink[]) {
  return http.get(apiUrl('/sharelinks'), ({ request }) => {
    const type = new URL(request.url).searchParams.get('type');
    const items = type === 'static' ? [staticLink] : invites;
    return HttpResponse.json({ items, nextCursor: null, hasMore: false });
  });
}

describe('ShareLinksManager (FR-033/028)', () => {
  it('copies the player share URL and flips to a copied confirmation', async () => {
    const user = userEvent.setup();
    server.use(listHandler([]));
    renderWithProviders(<ShareLinksManager />);

    expect(await screen.findByText('AB12CD')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /copy link/i }));

    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(staticLink.url);
  });

  it('creates a coach invite and prepends it as PENDING', async () => {
    const user = userEvent.setup();
    const created: ShareLink = { ...invite, id: 'inv-new', targetEmail: 'newcoach@club.com' };
    server.use(
      listHandler([]),
      http.post(apiUrl('/sharelinks/coach-invite'), () => HttpResponse.json(created, { status: 201 })),
    );
    renderWithProviders(<ShareLinksManager />);

    await user.click(await screen.findByRole('button', { name: /invite coach/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/coach email/i), 'newcoach@club.com');
    await user.click(within(dialog).getByRole('button', { name: /send invite/i }));

    const row = (await screen.findByText('newcoach@club.com')).closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('PENDING')).toBeInTheDocument();
  });

  it('revokes a pending invite and removes it from the list', async () => {
    const user = userEvent.setup();
    server.use(
      listHandler([invite]),
      http.delete(apiUrl('/sharelinks/inv1'), () => new HttpResponse(null, { status: 204 })),
    );
    renderWithProviders(<ShareLinksManager />);

    expect(await screen.findByText('existing@club.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /revoke invite to existing@club.com/i }));

    await waitFor(() => expect(screen.queryByText('existing@club.com')).not.toBeInTheDocument());
  });
});
