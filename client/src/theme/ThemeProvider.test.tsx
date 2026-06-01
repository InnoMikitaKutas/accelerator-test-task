import { http, HttpResponse } from 'msw';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { apiUrl } from '@/test/handlers';
import { makeStore } from '@/app/store';
import { setSession } from '@/features/session/sessionSlice';
import { setContext } from '@/features/context/activeContextSlice';
import type { SessionUser } from '@/types/api';
import { ThemeProvider } from './ThemeProvider';

const user: SessionUser = {
  id: 'u1',
  role: 'PLAYER',
  email: 'p@x.com',
  firstName: 'P',
  lastName: 'X',
  emailVerified: true,
  mustChangePassword: false,
};

function tunedStore() {
  const store = makeStore();
  store.dispatch(setSession(user));
  store.dispatch(setContext({ subjectProfileId: 'sub-1', trainerId: 'tr-9' }));
  return store;
}

describe('ThemeProvider', () => {
  it('themes the scope with the active trainer brand', async () => {
    server.use(
      http.get(apiUrl('/branding/tr-9'), () =>
        HttpResponse.json({
          trainerId: 'tr-9',
          logoUrl: null,
          primaryColorHex: '#1A73E8',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      ),
    );

    const { container } = renderWithProviders(
      <ThemeProvider>
        <span>zone3</span>
      </ThemeProvider>,
      { store: tunedStore() },
    );

    await waitFor(() => {
      const scope = container.querySelector('.branded');
      expect(scope).not.toBeNull();
      expect((scope as HTMLElement).style.getPropertyValue('--brand')).toBe('#1A73E8');
    });
  });

  it('stays Cinder (no branded scope, no fetch) when forced cinder', () => {
    const { container } = renderWithProviders(
      <ThemeProvider cinder>
        <span>zone1</span>
      </ThemeProvider>,
      { store: tunedStore() },
    );
    expect(container.querySelector('.branded')).toBeNull();
  });

  it('themes from an explicit previewColor without fetching', () => {
    const { container } = renderWithProviders(
      <ThemeProvider previewColor="#0B5AAD">
        <span>preview</span>
      </ThemeProvider>,
      { store: makeStore() },
    );
    const scope = container.querySelector('.branded') as HTMLElement;
    expect(scope.style.getPropertyValue('--brand')).toBe('#0B5AAD');
  });
});
