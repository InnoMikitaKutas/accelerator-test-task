import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ApprovalResponse, FamilyResponse } from '@/types/api';
import { Approvals } from './Approvals';

const HOUR = 3_600_000;

const family: FamilyResponse = {
  self: { profileId: 'self1', firstName: 'Pat', lastName: 'Parent', isSelf: true },
  children: [
    {
      profileId: 'kid1',
      firstName: 'Kid',
      lastName: 'Parent',
      age: 9,
      gender: 'UNSPECIFIED',
      hasLogin: false,
      allowTokenWithoutApproval: false,
      trainers: [],
    },
  ],
  pendingApprovals: 1,
};

function approval(over: Partial<ApprovalResponse> = {}): ApprovalResponse {
  return {
    id: 'a1',
    childProfileId: 'kid1',
    childDisplayName: 'Kid Parent',
    trainerId: 't1',
    itemRef: 'Spring Camp',
    paymentType: 'USD',
    amount: 5000,
    status: 'PENDING',
    requestedAt: new Date(Date.now() - HOUR).toISOString(),
    expiresAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    respondedAt: null,
    parentNote: null,
    ...over,
  };
}
const familyHandler = () => http.get(apiUrl('/family'), () => HttpResponse.json(family));

describe('Approvals (FR-024, M3)', () => {
  it('shows a live 48h ring + formatted amount for a PENDING approval', async () => {
    server.use(
      familyHandler(),
      http.get(apiUrl('/family/approvals'), () =>
        HttpResponse.json({ items: [approval()], nextCursor: null, hasMore: false }),
      ),
    );
    renderWithProviders(<Approvals />);

    expect(await screen.findByText('Spring Camp')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('approves a request and reflects the server status', async () => {
    const user = userEvent.setup();
    let approved = false;
    server.use(
      familyHandler(),
      http.get(apiUrl('/family/approvals'), () =>
        HttpResponse.json({
          items: [approval({ status: approved ? 'APPROVED' : 'PENDING' })],
          nextCursor: null,
          hasMore: false,
        }),
      ),
      http.post(apiUrl('/family/approvals/a1/approve'), () => {
        approved = true;
        return HttpResponse.json(approval({ status: 'APPROVED' }), { status: 200 });
      }),
    );
    renderWithProviders(<Approvals />);

    await user.click(await screen.findByRole('button', { name: /^approve/i }));
    // The terminal note is unique to a decided card (avoids matching the status <option>).
    expect(await screen.findByText(/marked approved/i)).toBeInTheDocument();
  });

  it('refetches on ring-zero and renders the server EXPIRED state (M3)', async () => {
    let calls = 0;
    server.use(
      familyHandler(),
      http.get(apiUrl('/family/approvals'), () => {
        calls += 1;
        // First load: still PENDING but already past expiry → ring fires onComplete →
        // refetch → server now reports EXPIRED (the sweep persisted it).
        const status = calls >= 2 ? 'EXPIRED' : 'PENDING';
        return HttpResponse.json({
          items: [approval({ status, expiresAt: new Date(Date.now() - 1000).toISOString() })],
          nextCursor: null,
          hasMore: false,
        });
      }),
    );
    renderWithProviders(<Approvals />);

    expect(await screen.findByText('EXPIRED')).toBeInTheDocument();
    expect(await screen.findByText(/auto-denied after 48 hours/i)).toBeInTheDocument();
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
  });

  it('persists a per-child token setting toggle', async () => {
    const user = userEvent.setup();
    let body: { allowTokenWithoutApproval?: boolean } | undefined;
    server.use(
      familyHandler(),
      http.get(apiUrl('/family/approvals'), () =>
        HttpResponse.json({ items: [], nextCursor: null, hasMore: false }),
      ),
      http.put(apiUrl('/family/children/kid1/token-setting'), async ({ request }) => {
        body = (await request.json()) as { allowTokenWithoutApproval?: boolean };
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderWithProviders(<Approvals />);

    await user.click(await screen.findByRole('checkbox', { name: 'Kid Parent' }));
    await waitFor(() => expect(body).toEqual({ allowTokenWithoutApproval: true }));
  });
});
