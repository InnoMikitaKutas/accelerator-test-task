import { useAppSelector } from '@/app/hooks';
import type { SessionStatus } from '@/features/session/sessionSlice';
import { useMeQuery } from './api';

/**
 * App-load session bootstrap (3.1): fire GET /auth/me once and keep it subscribed so
 * `changePassword`/`logout` Session-tag invalidations refetch the principal. The query's
 * onQueryStarted mirrors the result into the `session` slice; this hook just returns the
 * resulting status for the root to gate its initial render on.
 */
export function useSessionBootstrap(): SessionStatus {
  useMeQuery();
  return useAppSelector((s) => s.session.status);
}
