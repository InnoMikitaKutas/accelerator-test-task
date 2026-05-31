import { api } from '@/services/api';
import type { ContextsResponse, ContextRef } from '@/types/api';

/** Context switcher data + default persistence (FR-019/027). */
export const contextApi = api.injectEndpoints({
  endpoints: (build) => ({
    getContexts: build.query<ContextsResponse, void>({
      query: () => '/me/contexts',
      providesTags: ['Context'],
    }),
    setDefaultContext: build.mutation<void, ContextRef>({
      query: (body) => ({ url: '/me/contexts/default', method: 'PUT', body }),
    }),
  }),
});

export const { useGetContextsQuery, useSetDefaultContextMutation } = contextApi;
