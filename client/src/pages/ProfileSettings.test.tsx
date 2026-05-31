import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import type { ProfileResponse } from '@/types/api';
import { ProfileSettings } from './ProfileSettings';

const coach: ProfileResponse = {
  id: 'c1',
  role: 'COACH',
  email: 'coach@club.com',
  firstName: 'Casey',
  lastName: 'Coach',
  phone: null,
  photoUrl: null,
  thumbnailUrl: null,
  details: {
    kind: 'coach',
    bio: 'Old bio',
    credentials: ['UEFA B'],
    certifications: [],
    publicVisible: false,
  },
};

const player: ProfileResponse = {
  id: 'p1',
  role: 'PLAYER',
  email: 'pat@home.com',
  firstName: 'Pat',
  lastName: 'Player',
  phone: '+15551234567',
  photoUrl: null,
  thumbnailUrl: null,
  details: {
    kind: 'player',
    profileId: 'pp1',
    gender: 'UNSPECIFIED',
    school: 'Lincoln High',
    skillLevel: 'INTERMEDIATE',
    emergencyContact: { name: null, phone: null },
  },
};

describe('ProfileSettings (FR-038 role-shaped, FR-032 coach visibility)', () => {
  it('renders the coach-shaped block and omits player-only fields', async () => {
    server.use(http.get(apiUrl('/me/profile'), () => HttpResponse.json(coach)));
    renderWithProviders(<ProfileSettings />);

    expect(await screen.findByLabelText(/^bio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/credentials/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/show my profile in public discovery/i)).toBeInTheDocument();
    // read-only chip
    expect(screen.getByText('coach@club.com')).toBeInTheDocument();
    // player-only fields must not appear for a coach
    expect(screen.queryByText(/emergency contact/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/gender/i)).not.toBeInTheDocument();
  });

  it('renders the player-shaped block incl. a read-only skill level', async () => {
    server.use(http.get(apiUrl('/me/profile'), () => HttpResponse.json(player)));
    renderWithProviders(<ProfileSettings />);

    expect(await screen.findByLabelText(/gender/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/school/i)).toBeInTheDocument();
    expect(screen.getByText(/emergency contact/i)).toBeInTheDocument();
    expect(screen.getByText('INTERMEDIATE')).toBeInTheDocument(); // managed, read-only
    expect(screen.queryByLabelText(/^bio/i)).not.toBeInTheDocument();
  });

  it('shows the save bar only when dirty, then a saved confirmation', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl('/me/profile'), () => HttpResponse.json(coach)),
      http.patch(apiUrl('/me/profile'), () => HttpResponse.json(coach)),
    );
    renderWithProviders(<ProfileSettings />);

    await screen.findByLabelText(/first name/i);
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/last name/i), 'X');
    expect(await screen.findByText(/unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/^saved/i)).toBeInTheDocument();
  });

  it('submits common + role fields but never read-only fields', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(apiUrl('/me/profile'), () => HttpResponse.json(coach)),
      http.patch(apiUrl('/me/profile'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...coach, firstName: body.firstName });
      }),
    );
    renderWithProviders(<ProfileSettings />);

    const first = await screen.findByLabelText(/first name/i);
    await user.clear(first);
    await user.type(first, 'Cassidy');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await screen.findByText(/^saved/i);
    expect(body?.firstName).toBe('Cassidy');
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('skillLevel');
  });

  it('persists the coach public-visibility toggle (FR-032)', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(apiUrl('/me/profile'), () => HttpResponse.json(coach)),
      http.patch(apiUrl('/me/profile'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ...coach,
          details: { ...coach.details, publicVisible: body.publicVisible },
        });
      }),
    );
    renderWithProviders(<ProfileSettings />);

    const toggle = await screen.findByLabelText(/show my profile in public discovery/i);
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await screen.findByText(/^saved/i);
    expect(body?.publicVisible).toBe(true);
  });

  it('blocks save when only one emergency-contact field is filled', async () => {
    const user = userEvent.setup();
    let patched = false;
    server.use(
      http.get(apiUrl('/me/profile'), () => HttpResponse.json(player)),
      http.patch(apiUrl('/me/profile'), () => {
        patched = true;
        return HttpResponse.json(player);
      }),
    );
    renderWithProviders(<ProfileSettings />);

    await user.type(await screen.findByLabelText(/contact name/i), 'Mom');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/enter both a name and a phone/i)).toBeInTheDocument();
    expect(patched).toBe(false);
  });
});
