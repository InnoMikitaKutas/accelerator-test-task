import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { makeStore, type AppStore } from '@/app/store';
import { clearSession, setSession } from '@/features/session/sessionSlice';
import type { SessionUser } from '@/types/api';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  role: 'TRAINER',
  email: 't@x.com',
  firstName: 'Tess',
  lastName: 'Trainer',
  emailVerified: true,
  mustChangePassword: false,
  ...over,
});

/** Mount the guard at "/" with stub destinations for its redirects. */
function renderAtRoot(ui: ReactElement, store: AppStore) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={ui} />
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/forced-password-change" element={<p>change password</p>} />
    </Routes>,
    { store, initialEntries: ['/'] },
  );
}

describe('RequireAuth', () => {
  it('redirects an unauthenticated visitor to /login', () => {
    const store = makeStore();
    store.dispatch(clearSession());
    renderAtRoot(
      <RequireAuth>
        <p>protected</p>
      </RequireAuth>,
      store,
    );
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders children for an authenticated principal', () => {
    const store = makeStore();
    store.dispatch(setSession(user()));
    renderAtRoot(
      <RequireAuth>
        <p>protected</p>
      </RequireAuth>,
      store,
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('forces a mustChangePassword principal to the change-password screen', () => {
    const store = makeStore();
    store.dispatch(setSession(user({ mustChangePassword: true })));
    renderAtRoot(
      <RequireAuth>
        <p>protected</p>
      </RequireAuth>,
      store,
    );
    expect(screen.getByText('change password')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  /** Guard at "/guarded"; "/" is the home a wrong role gets bounced to. */
  function renderRoleGuard(ui: ReactElement, store: AppStore) {
    return renderWithProviders(
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/guarded" element={ui} />
      </Routes>,
      { store, initialEntries: ['/guarded'] },
    );
  }

  it('renders children when the role matches', () => {
    const store = makeStore();
    store.dispatch(setSession(user({ role: 'SUPER_ADMIN' })));
    renderRoleGuard(
      <RequireRole roles={['SUPER_ADMIN']}>
        <p>admin area</p>
      </RequireRole>,
      store,
    );
    expect(screen.getByText('admin area')).toBeInTheDocument();
  });

  it('bounces a wrong-role principal home', () => {
    const store = makeStore();
    store.dispatch(setSession(user({ role: 'PLAYER' })));
    renderRoleGuard(
      <RequireRole roles={['SUPER_ADMIN']}>
        <p>admin area</p>
      </RequireRole>,
      store,
    );
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.queryByText('admin area')).not.toBeInTheDocument();
  });
});
