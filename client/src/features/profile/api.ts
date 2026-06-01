import { api } from '@/services/api';
import type { Gender, PhotoUploadResult, ProfileResponse } from '@/types/api';

/**
 * Module C — Profiles (api-designer-spec §Module C). Self-service: `JwtAuthGuard`
 * only, no X-Active-Context (unscoped). The response/update shape is role-discriminated;
 * the server applies only the fields relevant to the caller's role, so one combined
 * update body is correct (read-only `email`/`role`/`skillLevel` are rejected by the
 * server whitelist — FR-038).
 */

/** Combined profile update — mirrors the backend `UpdateProfileDto` (server picks by role). */
export interface UpdateProfileRequest {
  // Common (users)
  firstName?: string;
  lastName?: string;
  phone?: string;
  // Trainer
  businessName?: string;
  businessAddress?: string;
  // Coach
  bio?: string;
  credentials?: string[];
  certifications?: string[];
  publicVisible?: boolean;
  // Player (self)
  gender?: Gender;
  school?: string;
  /** All-or-nothing: the server requires both name + phone when present. */
  emergencyContact?: { name: string; phone: string };
}

export const profileApi = api.injectEndpoints({
  endpoints: (build) => ({
    getMyProfile: build.query<ProfileResponse, void>({
      query: () => '/me/profile',
      providesTags: ['Profile'],
    }),

    updateMyProfile: build.mutation<ProfileResponse, UpdateProfileRequest>({
      query: (body) => ({ url: '/me/profile', method: 'PATCH', body }),
      // The session principal (TopBar name) comes from /auth/me; a name change must
      // re-hydrate it. Invalidating Session refetches /auth/me only when it has a live
      // subscriber (the app shell), so an isolated profile screen pays nothing.
      invalidatesTags: ['Session'],
      // Write the canonical server response straight into the Profile cache so the
      // page reflects saved state (and the dirty bar clears) without a refetch.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(profileApi.util.updateQueryData('getMyProfile', undefined, () => data));
        } catch {
          /* surfaced to the form via the mutation result */
        }
      },
    }),

    // multipart/form-data — fetchBaseQuery passes a FormData body through untouched
    // (no JSON serialization, browser sets the multipart boundary). The client guard
    // (lib/uploadGuard, M4) runs in the component before this ever fires.
    uploadProfilePhoto: build.mutation<PhotoUploadResult, FormData>({
      query: (body) => ({ url: '/me/profile/photo', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            profileApi.util.updateQueryData('getMyProfile', undefined, (draft) => {
              draft.photoUrl = data.photoUrl;
              draft.thumbnailUrl = data.thumbnailUrl;
            }),
          );
        } catch {
          /* surfaced to the uploader via the mutation result */
        }
      },
    }),
  }),
});

export const {
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  useUploadProfilePhotoMutation,
} = profileApi;
