import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { makeStore } from '@/app/store';
import { setSession } from '@/features/session/sessionSlice';
import type { ContextsResponse, SessionUser } from '@/types/api';
import { ChannelBar } from './ChannelBar';

const player: SessionUser = {
  id: 'u1',
  role: 'PLAYER',
  email: 'dana@x.com',
  firstName: 'Dana',
  lastName: 'L',
  emailVerified: true,
  mustChangePassword: false,
};

function playerStore() {
  const store = makeStore();
  store.dispatch(setSession(player));
  return store;
}

function mockContexts(body: ContextsResponse, putBodies: unknown[] = []) {
  server.use(
    http.get(apiUrl('/me/contexts'), () => HttpResponse.json(body)),
    http.put(apiUrl('/me/contexts/default'), async ({ request }) => {
      putBodies.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const MULTI: ContextsResponse = {
  subjects: [
    {
      profileId: 'sub-me',
      displayName: 'Dana',
      isSelf: true,
      isChild: false,
      trainers: [{ trainerId: 'tr-1', name: 'Coach Smith', status: 'active' }],
    },
    {
      profileId: 'sub-emma',
      displayName: 'Emma',
      isSelf: false,
      isChild: true,
      trainers: [
        { trainerId: 'tr-1', name: 'Coach Smith', status: 'active' },
        { trainerId: 'tr-2', name: 'Coach Lee', status: 'active' },
      ],
    },
  ],
  defaultContext: { subjectProfileId: 'sub-me', trainerId: 'tr-1' },
};

describe('ChannelBar', () => {
  it('auto-tunes to the default and renders subject picker + trainer tabs', async () => {
    mockContexts(MULTI);
    const store = playerStore();
    renderWithProviders(<ChannelBar />, { store });

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Dana/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(store.getState().activeContext.current).toEqual({
        subjectProfileId: 'sub-me',
        trainerId: 'tr-1',
      }),
    );
  });

  it('tuning a channel updates context, persists the default, and announces', async () => {
    const user = userEvent.setup();
    const putBodies: unknown[] = [];
    mockContexts(MULTI, putBodies);
    const store = playerStore();
    renderWithProviders(<ChannelBar />, { store });

    await waitFor(() => expect(screen.getByRole('button', { name: /Dana/ })).toBeInTheDocument());

    // Switch subject to Emma (auto-tunes to her first trainer)...
    await user.click(screen.getByRole('button', { name: /Dana/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Emma/ }));

    // ...then tune to Coach Lee.
    await user.click(screen.getByRole('tab', { name: 'Coach Lee' }));

    await waitFor(() =>
      expect(store.getState().activeContext.current).toEqual({
        subjectProfileId: 'sub-emma',
        trainerId: 'tr-2',
      }),
    );
    expect(screen.getByText('Now viewing Emma with Coach Lee.')).toBeInTheDocument();
    await waitFor(() =>
      expect(putBodies).toContainEqual({ subjectProfileId: 'sub-emma', trainerId: 'tr-2' }),
    );
  });

  it('is hidden when there is a single subject with a single trainer', async () => {
    mockContexts({
      subjects: [
        {
          profileId: 'sub-me',
          displayName: 'Dana',
          isSelf: true,
          isChild: false,
          trainers: [{ trainerId: 'tr-1', name: 'Coach Smith', status: 'active' }],
        },
      ],
      defaultContext: { subjectProfileId: 'sub-me', trainerId: 'tr-1' },
    });
    const store = playerStore();
    renderWithProviders(<ChannelBar />, { store });

    // It still auto-selects the only channel, but renders no switcher.
    await waitFor(() =>
      expect(store.getState().activeContext.current).toEqual({
        subjectProfileId: 'sub-me',
        trainerId: 'tr-1',
      }),
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Tuned to')).not.toBeInTheDocument();
  });

  it('shows "Connect a coach" for a subject with no active trainers', async () => {
    const user = userEvent.setup();
    mockContexts({
      subjects: [
        {
          profileId: 'sub-me',
          displayName: 'Dana',
          isSelf: true,
          isChild: false,
          trainers: [{ trainerId: 'tr-1', name: 'Coach Smith', status: 'active' }],
        },
        { profileId: 'sub-liam', displayName: 'Liam', isSelf: false, isChild: true, trainers: [] },
      ],
      defaultContext: { subjectProfileId: 'sub-me', trainerId: 'tr-1' },
    });
    renderWithProviders(<ChannelBar />, { store: playerStore() });

    await waitFor(() => expect(screen.getByRole('button', { name: /Dana/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Dana/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Liam/ }));

    expect(screen.getByText('Connect a coach')).toBeInTheDocument();
  });
});
