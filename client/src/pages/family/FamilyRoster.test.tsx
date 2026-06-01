import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { FamilyResponse } from '@/types/api';
import { FamilyRoster } from './FamilyRoster';

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
      trainers: [{ trainerId: 't1', name: 'Club FC' }],
    },
  ],
  pendingApprovals: 2,
};

describe('FamilyRoster (FR-027)', () => {
  it('renders self + children with the pending-approvals count', async () => {
    server.use(http.get(apiUrl('/family'), () => HttpResponse.json(family)));
    renderWithProviders(<FamilyRoster />);

    expect(await screen.findByText('Pat Parent')).toBeInTheDocument();
    expect(screen.getByText('Kid Parent')).toBeInTheDocument();
    expect(screen.getByText('Age 9')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // pending approvals stat
  });

  it('tunes into a channel when a lane chip is tapped', async () => {
    const user = userEvent.setup();
    server.use(http.get(apiUrl('/family'), () => HttpResponse.json(family)));
    const { store } = renderWithProviders(<FamilyRoster />);

    await user.click(await screen.findByRole('button', { name: 'Club FC' }));

    await waitFor(() =>
      expect(store.getState().activeContext.current).toEqual({
        subjectProfileId: 'kid1',
        trainerId: 't1',
      }),
    );
  });
});
