import { api } from '@/services/api';
import type { ImpersonationState } from '@/types/api';

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
  }),
});

export const { useStartImpersonationMutation, useExitImpersonationMutation } = impersonationApi;
