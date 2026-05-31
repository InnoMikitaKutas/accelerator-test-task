import { api } from '@/services/api';

/** Impersonation exit (FR-015). Start + history endpoints arrive in Phase 9. */
export const impersonationApi = api.injectEndpoints({
  endpoints: (build) => ({
    exitImpersonation: build.mutation<void, void>({
      query: () => ({ url: '/impersonate/exit', method: 'POST' }),
      // Server restores the admin session; refetch principal + contexts.
      invalidatesTags: ['Session', 'Context'],
    }),
  }),
});

export const { useExitImpersonationMutation } = impersonationApi;
