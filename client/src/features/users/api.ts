import { api } from '@/services/api';
import type { GdprDeleteResult, Paginated, Role, UserResponse, UserStatus } from '@/types/api';

/**
 * Module B — Users / Super Admin (api-designer-spec §Module B). Super-Admin-only,
 * cross-tenant; no X-Active-Context. Request DTOs co-located with the feature.
 *
 * The directory page overlays mutation results onto its accumulated keyset list
 * locally (usePaginated is append-only + idempotent per cursor, so cache
 * invalidation can't re-merge an updated page) — hence these mutations don't
 * invalidate the list tag.
 */

// `type` (not interface) so it satisfies usePaginated's `A extends Record<string, unknown>`.
export type UserListArg = {
  limit?: number;
  cursor?: string;
  search?: string;
  role?: Role;
  status?: UserStatus;
  trainerId?: string;
  sort?: string;
};

export interface CreateTrainerRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  businessName: string;
  businessAddress?: string;
  onboardingMode?: 'INVITE' | 'TEMP_PASSWORD';
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface GdprDeleteRequest {
  reason: string;
  confirmEmail: string;
}

export const usersApi = api.injectEndpoints({
  endpoints: (build) => ({
    listUsers: build.query<Paginated<UserResponse>, UserListArg>({
      query: ({ limit = 25, cursor, search, role, status, trainerId, sort }) => ({
        url: '/users',
        // fetchBaseQuery drops undefined params, so unset filters are simply omitted.
        params: { limit, cursor, search, role, status, trainerId, sort },
      }),
      providesTags: ['User'],
    }),

    getUser: build.query<UserResponse, string>({
      query: (id) => `/users/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'User', id }],
    }),

    createTrainer: build.mutation<UserResponse, CreateTrainerRequest>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
    }),

    updateUser: build.mutation<UserResponse, { id: string; body: UpdateUserRequest }>({
      query: ({ id, body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
    }),

    deactivateUser: build.mutation<UserResponse, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/users/${id}/deactivate`, method: 'POST', body: { reason } }),
    }),

    reactivateUser: build.mutation<UserResponse, string>({
      query: (id) => ({ url: `/users/${id}/reactivate`, method: 'POST' }),
    }),

    gdprDeleteUser: build.mutation<GdprDeleteResult, { id: string; body: GdprDeleteRequest }>({
      query: ({ id, body }) => ({ url: `/users/${id}`, method: 'DELETE', body }),
    }),
  }),
});

export const {
  useListUsersQuery,
  useGetUserQuery,
  useCreateTrainerMutation,
  useUpdateUserMutation,
  useDeactivateUserMutation,
  useReactivateUserMutation,
  useGdprDeleteUserMutation,
} = usersApi;
