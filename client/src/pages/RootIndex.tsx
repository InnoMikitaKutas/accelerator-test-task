import { Link, Navigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/Button';
import { useLogoutMutation } from '@/features/auth/api';

/**
 * Temporary "/" landing for Phase 3 so the auth flow is runnable end-to-end:
 *  - booting (idle/loading) → a quiet placeholder while GET /auth/me settles;
 *  - signed out → redirect to /login;
 *  - signed in → a minimal confirmation + Log out.
 *
 * Phase 10.1 replaces this with the real RequireAuth guard, role-aware AppShell, and
 * the full route tree. Kept deliberately shell-free here to avoid pulling in
 * Channel Bar / context fetches before those phases exist.
 */
export function RootIndex() {
  const status = useAppSelector((s) => s.session.status);
  const user = useAppSelector((s) => s.session.user);
  const [logout, { isLoading }] = useLogoutMutation();

  if (status === 'idle' || status === 'loading') {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <output style={{ color: 'var(--ink-3)' }}>Loading…</output>
      </main>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--sp-6)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', textAlign: 'center' }}>
        <p className="u-label" style={{ color: 'var(--brand-text)' }}>
          Signed in
        </p>
        <h1>
          Welcome, {user.firstName} {user.lastName}
        </h1>
        <p style={{ color: 'var(--ink-2)' }}>
          Your workspace arrives in the next phases. For now, authentication is wired end-to-end.
        </p>
        {user.role === 'SUPER_ADMIN' ? <Link to="/admin/users">Manage users</Link> : null}
        <Button variant="secondary" loading={isLoading} onClick={() => logout()}>
          Log out
        </Button>
      </div>
    </main>
  );
}
