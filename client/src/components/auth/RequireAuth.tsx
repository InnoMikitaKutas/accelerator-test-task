import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { FORCED_PASSWORD_CHANGE_ROUTE } from '@/services/errorMap';

/**
 * Authenticated-route gate (Task 10.1). While GET /auth/me is still settling (idle/
 * loading) we hold on a quiet placeholder rather than flashing the login screen;
 * once settled, no principal → /login. A `mustChangePassword` principal is forced to
 * the change-password screen before anything else (mirrors the backend guard order).
 * Email-verification is intentionally NOT hard-walled here — the global
 * VerifyEmailBanner is the chosen L7 soft path.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.session.status);
  const user = useAppSelector((s) => s.session.user);

  if (status === 'idle' || status === 'loading') {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <output style={{ color: 'var(--ink-3)' }}>Loading…</output>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to={FORCED_PASSWORD_CHANGE_ROUTE} replace />;

  return <>{children}</>;
}
