import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { makeStore } from '@/app/store';
import { setSession } from '@/features/session/sessionSlice';
import { VerifyEmailBanner } from '@/components/system/VerifyEmailBanner';
import type { JoinResolve, SessionUser } from '@/types/api';
import { JoinLanding } from './JoinLanding';

const CODE = 'AB12CD';

const validStatic: JoinResolve = {
  code: CODE,
  type: 'static',
  status: 'VALID',
  trainerDisplayName: 'Club FC',
  branding: null,
  requiresAccount: true,
  prefillEmail: null,
};

function routed() {
  return (
    <Routes>
      <Route path="/join/:code" element={<JoinLanding />} />
    </Routes>
  );
}

function authedStore(overrides: Partial<SessionUser> = {}) {
  const store = makeStore();
  store.dispatch(
    setSession({
      id: 'u1',
      role: 'PLAYER',
      email: 'parent@home.com',
      firstName: 'Pat',
      lastName: 'Parent',
      emailVerified: true,
      mustChangePassword: false,
      ...overrides,
    }),
  );
  return store;
}

describe('JoinLanding (FR-017/018/028/029; M1, L7)', () => {
  it('themes the page with the trainer brand + logo (C1)', async () => {
    server.use(
      http.get(apiUrl(`/join/${CODE}`), () =>
        HttpResponse.json({
          ...validStatic,
          branding: {
            logoUrl: 'http://localhost:3000/static/logos/club.png',
            primaryColorHex: '#1166CC',
          },
        }),
      ),
    );
    const { container } = renderWithProviders(routed(), { initialEntries: [`/join/${CODE}`] });

    expect(await screen.findByText('Club FC')).toBeInTheDocument();
    const logo = screen.getByRole('img', { name: /club fc logo/i });
    expect(logo.getAttribute('src')).toBe('http://localhost:3000/static/logos/club.png');
    // ThemeProvider applied the trainer brand to a scoped, branded container.
    expect(container.querySelector('[data-branded="true"]')).not.toBeNull();
  });

  it('authenticated + static: chooses a subject and associates', async () => {
    const user = userEvent.setup();
    let body: { subjectProfileId?: string } | undefined;
    server.use(
      http.get(apiUrl(`/join/${CODE}`), () => HttpResponse.json(validStatic)),
      http.get(apiUrl('/me/contexts'), () =>
        HttpResponse.json({
          subjects: [
            { profileId: 'self1', displayName: 'Pat', isSelf: true, isChild: false, trainers: [] },
            { profileId: 'kid1', displayName: 'Kid', isSelf: false, isChild: true, trainers: [] },
          ],
          defaultContext: null,
        }),
      ),
      http.post(apiUrl(`/join/${CODE}`), async ({ request }) => {
        body = (await request.json()) as { subjectProfileId?: string };
        return HttpResponse.json(
          { association: { trainerId: 't1', playerProfileId: 'self1', status: 'active' }, context: { subjectProfileId: 'self1', trainerId: 't1' } },
          { status: 201 },
        );
      }),
    );
    const { store } = renderWithProviders(routed(), {
      store: authedStore(),
      initialEntries: [`/join/${CODE}`],
    });

    // Pick the child explicitly so the chooser (not just the self-default) drives the request.
    await user.click(await screen.findByRole('radio', { name: /kid/i }));
    await user.click(screen.getByRole('button', { name: /add this connection/i }));

    expect(await screen.findByText(/you're connected to club fc/i)).toBeInTheDocument();
    expect(body?.subjectProfileId).toBe('kid1');
    // associate invalidates the Context tag → let the contexts refetch settle so it doesn't
    // resolve after afterEach's handler reset and bleed into the next test as unhandled.
    await waitFor(() =>
      expect(
        Object.values(store.getState().api.queries).some((q) => q?.status === 'pending'),
      ).toBe(false),
    );
  });

  it('authenticated + unique (coach invite): shows the M1 logout-and-register notice and never associates', async () => {
    let consumeCalls = 0;
    server.use(
      http.get(apiUrl(`/join/${CODE}`), () =>
        HttpResponse.json({ ...validStatic, type: 'unique', prefillEmail: 'coach@club.com' }),
      ),
      http.post(apiUrl(`/join/${CODE}`), () => {
        consumeCalls += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderWithProviders(routed(), { store: authedStore(), initialEntries: [`/join/${CODE}`] });

    expect(await screen.findByText(/must be redeemed by creating a new account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    // The associate panel / chooser must NOT render, and nothing is consumed.
    expect(screen.queryByRole('button', { name: /add this connection/i })).not.toBeInTheDocument();
    expect(consumeCalls).toBe(0);
  });

  it('unauthenticated: registers, sets the session, and surfaces the verify-email banner (L7)', async () => {
    const user = userEvent.setup();
    const newUser: SessionUser = {
      id: 'new1',
      role: 'PLAYER',
      email: 'newplayer@home.com',
      firstName: 'New',
      lastName: 'Player',
      emailVerified: false,
      mustChangePassword: false,
    };
    server.use(
      http.get(apiUrl(`/join/${CODE}`), () => HttpResponse.json(validStatic)),
      http.post(apiUrl(`/join/${CODE}`), () => HttpResponse.json(newUser, { status: 201 })),
    );
    const store = makeStore();
    const { container } = renderWithProviders(
      <>
        <VerifyEmailBanner />
        {routed()}
      </>,
      { store, initialEntries: [`/join/${CODE}`] },
    );

    await user.type(await screen.findByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Player');
    await user.type(screen.getByLabelText(/^email/i), 'newplayer@home.com');
    await user.type(screen.getByLabelText(/^password/i), 'password1');
    await user.click(screen.getByRole('button', { name: /create account & join/i }));

    // Session set from the response (auto-login) → persistent L7 banner renders.
    await waitFor(() => expect(store.getState().session.user?.id).toBe('new1'));
    expect(store.getState().session.user?.emailVerified).toBe(false);
    expect(within(container).getByText(/verify your email/i)).toBeInTheDocument();
  });

  it('authenticated minor: a server MINOR_FORBIDDEN shows the ask-a-parent copy', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl(`/join/${CODE}`), () => HttpResponse.json(validStatic)),
      http.get(apiUrl('/me/contexts'), () =>
        HttpResponse.json({
          subjects: [{ profileId: 'self1', displayName: 'Kid', isSelf: true, isChild: true, trainers: [] }],
          defaultContext: null,
        }),
      ),
      http.post(apiUrl(`/join/${CODE}`), () =>
        HttpResponse.json({ errorCode: 'MINOR_FORBIDDEN' }, { status: 403 }),
      ),
    );
    renderWithProviders(routed(), { store: authedStore(), initialEntries: [`/join/${CODE}`] });

    await user.click(await screen.findByRole('button', { name: /add this connection/i }));

    expect(await screen.findByText(/ask a parent to add this/i)).toBeInTheDocument();
  });
});
