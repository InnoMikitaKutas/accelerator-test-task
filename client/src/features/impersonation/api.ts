import { api } from '@/services/api';
import type { ImpersonationLog, ImpersonationState, Paginated } from '@/types/api';

// `type` (not interface) so it satisfies usePaginated's `A extends Record<string, unknown>`.
export type ImpersonationHistoryArg = {
  limit?: number;
  cursor?: string;
  adminId?: string;
  targetUserId?: string;
  /** ISO date lower/upper bounds. */
  from?: string;
  to?: string;
};

/**
 * Impersonation (Module G). Start/exit re-issue session cookies server-side and carry
 * `impersonatorAdminId`; the client just refetches the principal. Invalidating
 * 'Session' refetches GET /auth/me (kept subscribed by useSessionBootstrap) → the
 * banner mounts (start, H1) or unmounts (exit) from `user.impersonatedBy`. 'Context'
 * is invalidated too since the active subject changes with the principal.
 */
export const impersonationApi = api.injectEndpoints({
  endpoints: (build) => ({
    startImpersonation: build.mutation<ImpersonationState, { userId: string; reason?: string }>({
      query: ({ userId, reason }) => ({ url: `/impersonate/${userId}`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Session', 'Context'],
    }),

    exitImpersonation: build.mutation<ImpersonationState, void>({
      query: () => ({ url: '/impersonate/exit', method: 'POST' }),
      invalidatesTags: ['Session', 'Context'],
    }),

    // Super-Admin audit report (FR-016); durations populate via the TASK-002 H1 sweep.
    impersonationHistory: build.query<Paginated<ImpersonationLog>, ImpersonationHistoryArg>({
      query: ({ limit = 25, cursor, adminId, targetUserId, from, to }) => ({
        url: '/impersonation/history',
        params: { limit, cursor, adminId, targetUserId, from, to },
      }),
      providesTags: ['Impersonation'],
    }),
  }),
});

export const {
  useStartImpersonationMutation,
  useExitImpersonationMutation,
  useImpersonationHistoryQuery,
} = impersonationApi;
