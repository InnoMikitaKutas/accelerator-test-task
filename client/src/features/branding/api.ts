import { api } from '@/services/api';
import type { Branding } from '@/types/api';

/**
 * Branding endpoints. Only the public resolver (GET /branding/:trainerId) is needed
 * for theming now; the trainer-owned write/upload endpoints arrive in Phase 9.
 * Per-trainer branding is cached (read-heavy) and tagged by trainerId for invalidation.
 */
export const brandingApi = api.injectEndpoints({
  endpoints: (build) => ({
    getBrandingByTrainer: build.query<Branding, string>({
      query: (trainerId) => `/branding/${trainerId}`,
      providesTags: (_result, _error, trainerId) => [{ type: 'Branding', id: trainerId }],
    }),
  }),
});

export const { useGetBrandingByTrainerQuery } = brandingApi;
