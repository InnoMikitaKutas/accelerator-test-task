import { api } from '@/services/api';
import type {
  AvailabilityResponse,
  Paginated,
  SubjectType,
  TimeSlot,
  TrainerAvailabilityRow,
} from '@/types/api';

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

/** Per-subject Availability cache tag (Best Times are shared-per-child → keyed by subject). */
const subjectTag = (subjectType: SubjectType, subjectId: string) =>
  ({ type: 'Availability' as const, id: `${subjectType}:${subjectId}` });

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

    // Owner read of a subject's Best Times / My Times (FR-030/039).
    getAvailability: build.query<AvailabilityResponse, { subjectType: SubjectType; subjectId: string }>({
      query: ({ subjectType, subjectId }) => `/availability/${subjectType}/${subjectId}`,
      providesTags: (_r, _e, a) => [subjectTag(a.subjectType, a.subjectId)],
    }),

    // Full-set replacement (PUT semantics). Server validates start<end + rejects overlaps.
    replaceAvailability: build.mutation<
      AvailabilityResponse,
      { subjectType: SubjectType; subjectId: string; slots: TimeSlot[] }
    >({
      query: ({ subjectType, subjectId, slots }) => ({
        url: `/availability/${subjectType}/${subjectId}`,
        method: 'PUT',
        body: { slots },
      }),
      invalidatesTags: (_r, _e, a) => [subjectTag(a.subjectType, a.subjectId)],
    }),
  }),
});

export const {
  useTrainerAvailabilityQuery,
  useGetAvailabilityQuery,
  useReplaceAvailabilityMutation,
} = availabilityApi;
