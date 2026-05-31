import { api } from '@/services/api';
import type { Paginated, TrainerAvailabilityRow } from '@/types/api';

/**
 * Module F — Availability / Best Times (api-designer-spec §Module F).
 *
 * Task 8.3 wires the trainer-side read only: `GET /trainer/availability`, a
 * Zone-3/org heatmap of associated players' Best Times with day/time filters
 * (FR-034), advisory only (BR-012). The owner get/replace endpoints (8.1/8.2) and
 * the coach-conflict override (8.4) inject onto this same slice later.
 *
 * Best Times are shared-per-child (Zone-2, no trainerId) per the locked API flag,
 * so this endpoint takes NO `X-Active-Context`.
 */

// `type` (not interface) so it satisfies usePaginated's `A extends Record<string, unknown>`.
export type TrainerAvailabilityArg = {
  limit?: number;
  cursor?: string;
  /** 0=Sunday … 6=Saturday; sent verbatim (0 is a valid value, not "unset"). */
  dayOfWeek?: number;
  /** 'HH:mm' — narrow to players free at/after this time. */
  availableAt?: string;
  /** Player-name search. */
  search?: string;
};

export const availabilityApi = api.injectEndpoints({
  endpoints: (build) => ({
    trainerAvailability: build.query<Paginated<TrainerAvailabilityRow>, TrainerAvailabilityArg>({
      query: ({ limit = 25, cursor, dayOfWeek, availableAt, search }) => ({
        url: '/trainer/availability',
        // fetchBaseQuery drops `undefined` params (so unset filters are omitted) but
        // keeps `0` — required so dayOfWeek=Sunday is actually sent.
        params: { limit, cursor, dayOfWeek, availableAt, search },
      }),
      providesTags: ['Availability'],
    }),
  }),
});

export const { useTrainerAvailabilityQuery } = availabilityApi;
