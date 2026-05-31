import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { makeStore } from '@/app/store';
import { setSession } from '@/features/session/sessionSlice';
import type { SessionUser } from '@/types/api';
import { RailNav } from './RailNav';
import { NotificationsBell, type NotificationAlert } from './NotificationsBell';
import { AppShell } from './AppShell';

const player: SessionUser = {
  id: 'u1',
  role: 'PLAYER',
  email: 'p@x.com',
  firstName: 'Dana',
  lastName: 'Lopez',
  emailVerified: true,
  mustChangePassword: false,
};

const alert: NotificationAlert = {
  id: 'a1',
  message: 'Liam · Coach Jones — approval needed',
  channelLabel: 'Liam · Coach Jones',
  context: { subjectProfileId: 'sub-liam', trainerId: 'tr-jones' },
  href: '/approvals/a1',
  unread: true,
};

describe('RailNav (FR-008)', () => {
  it('shows only Super-Admin items for SUPER_ADMIN', () => {
    renderWithProviders(<RailNav role="SUPER_ADMIN" />);
    expect(screen.getByRole('link', { name: /Users/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Impersonation log/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Family/ })).not.toBeInTheDocument();
  });

  it('shows the player items for PLAYER', () => {
    renderWithProviders(<RailNav role="PLAYER" />);
    for (const label of ['Channel', 'Family', 'Approvals', 'Best Times', 'Account']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });
});

describe('NotificationsBell', () => {
  it('opens and calls onSelect with the alert', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<NotificationsBell alerts={[alert]} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Notifications, 1 unread/ }));
    await user.click(screen.getByRole('menuitem'));

    expect(onSelect).toHaveBeenCalledWith(alert);
  });
});

describe('AppShell', () => {
  it('renders the role rail + children and switches context on alert select', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.dispatch(setSession(player));

    renderWithProviders(
      <AppShell alerts={[alert]}>
        <p>Workspace</p>
      </AppShell>,
      { store },
    );

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Family/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('menuitem'));

    expect(store.getState().activeContext.current).toEqual(alert.context);
  });
});
