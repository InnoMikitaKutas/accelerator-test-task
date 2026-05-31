import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import type { Role } from '@/types/api';

/**
 * Role gate (Task 10.1). Assumes it renders inside RequireAuth (principal present).
 * A wrong-role principal is bounced to "/" — their own role-appropriate home — rather
 * than shown a raw 403 (frontend-design-spec: friendly "not available here").
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const user = useAppSelector((s) => s.session.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
