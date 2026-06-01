import { api } from '@/services/api';
import type { Branding } from '@/types/api';

/**
 * Branding endpoints (Module H). The public resolver (GET /branding/:trainerId) themes
 * any client; the trainer-owned read/upload/color endpoints drive BrandingSettings.
 * Per-trainer branding is cached (read-heavy); a write invalidates BOTH the owner read
 * and the per-trainer public tag so players re-theme on next resolve.
 */
const ownTags = (b?: Branding) =>
  b
    ? [{ type: 'Branding' as const, id: 'OWN' }, { type: 'Branding' as const, id: b.trainerId }]
    : [{ type: 'Branding' as const, id: 'OWN' }];

export const brandingApi = api.injectEndpoints({
  endpoints: (build) => ({
    getBrandingByTrainer: build.query<Branding, string>({
      query: (trainerId) => `/branding/${trainerId}`,
      providesTags: (_result, _error, trainerId) => [{ type: 'Branding', id: trainerId }],
    }),

    // Trainer's own branding (FR-037).
    getOwnBranding: build.query<Branding, void>({
      query: () => '/trainer/branding',
      providesTags: (r) => ownTags(r),
    }),

    // PNG/JPG/SVG ≤2MB; server sanitizes SVG + auto-resizes (C1). multipart passthrough.
    uploadLogo: build.mutation<Branding, FormData>({
      query: (body) => ({ url: '/trainer/branding/logo', method: 'POST', body }),
      invalidatesTags: (r) => ownTags(r),
    }),

    // Set the org primary color (FR-037). Server validates the 6-digit hex.
    setBrandingColor: build.mutation<Branding, { primaryColorHex: string }>({
      query: (body) => ({ url: '/trainer/branding', method: 'PUT', body }),
      invalidatesTags: (r) => ownTags(r),
    }),
  }),
});

export const {
  useGetBrandingByTrainerQuery,
  useGetOwnBrandingQuery,
  useUploadLogoMutation,
  useSetBrandingColorMutation,
} = brandingApi;
