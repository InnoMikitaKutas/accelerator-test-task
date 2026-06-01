import { api } from '@/services/api';
import type {
  ApprovalResponse,
  ApprovalStatus,
  ChildSummary,
  FamilyResponse,
  Paginated,
} from '@/types/api';

/**
 * Module E — Family / Parent-Child (api-designer-spec §Module E). RolesGuard(PLAYER).
 *
 * Children, associations and approvals are Zone-1 (account-global) and unscoped — they
 * do NOT take X-Active-Context. The exception is `createPurchaseRequest`, a Zone-3
 * action tied to a specific trainer (scoped: true).
 *
 * The roster (getFamily) is a plain query, so mutations invalidate Family/Approval tags
 * to refetch canonical state (unlike the keyset lists, which overlay locally).
 */

export interface CreateChildRequest {
  firstName: string;
  lastName: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
  school?: string;
  /** Acknowledge the duplicate-name+age warning and proceed (FR-021). */
  confirmDuplicate?: boolean;
}

/** Associate a child with a trainer — one of `code` | `trainerId` (FR-023). */
export interface ChildTrainerAssocRequest {
  code?: string;
  trainerId?: string;
}

export interface PurchaseRequest {
  childProfileId: string;
  itemRef: string;
  paymentType: 'USD' | 'TOKEN';
  /** Minor units; required when paymentType=USD. */
  amount?: number;
  childNote?: string;
}

export type ApprovalListArg = {
  limit?: number;
  cursor?: string;
  status?: ApprovalStatus;
  childProfileId?: string;
};

export const familyApi = api.injectEndpoints({
  endpoints: (build) => ({
    getFamily: build.query<FamilyResponse, void>({
      query: () => '/family',
      providesTags: ['Family'],
    }),

    createChild: build.mutation<ChildSummary, CreateChildRequest>({
      query: (body) => ({ url: '/family/children', method: 'POST', body }),
      invalidatesTags: ['Family'],
    }),

    addChildTrainer: build.mutation<unknown, { childId: string; body: ChildTrainerAssocRequest }>({
      query: ({ childId, body }) => ({ url: `/family/children/${childId}/trainers`, method: 'POST', body }),
      invalidatesTags: ['Family'],
    }),

    removeChildTrainer: build.mutation<void, { childId: string; trainerId: string }>({
      query: ({ childId, trainerId }) => ({
        url: `/family/children/${childId}/trainers/${trainerId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Family'],
    }),

    setTokenSetting: build.mutation<unknown, { childId: string; allowTokenWithoutApproval: boolean }>({
      query: ({ childId, allowTokenWithoutApproval }) => ({
        url: `/family/children/${childId}/token-setting`,
        method: 'PUT',
        body: { allowTokenWithoutApproval },
      }),
      invalidatesTags: ['Family'],
    }),

    // Zone-3 action (tied to a trainer) — needs X-Active-Context. Children MAY request;
    // it creates a PENDING approval routed to the parent (FR-024/026).
    createPurchaseRequest: build.mutation<ApprovalResponse, PurchaseRequest>({
      query: (body) => ({ url: '/family/purchase-requests', method: 'POST', body }),
      extraOptions: { scoped: true },
      invalidatesTags: ['Approval', 'Family'],
    }),

    listApprovals: build.query<Paginated<ApprovalResponse>, ApprovalListArg>({
      query: ({ limit = 25, cursor, status, childProfileId }) => ({
        url: '/family/approvals',
        params: { limit, cursor, status, childProfileId },
      }),
      providesTags: ['Approval'],
    }),

    approveApproval: build.mutation<ApprovalResponse, { id: string; parentNote?: string }>({
      query: ({ id, parentNote }) => ({
        url: `/family/approvals/${id}/approve`,
        method: 'POST',
        body: { parentNote },
      }),
      invalidatesTags: ['Approval', 'Family'],
    }),

    denyApproval: build.mutation<ApprovalResponse, { id: string; parentNote?: string }>({
      query: ({ id, parentNote }) => ({
        url: `/family/approvals/${id}/deny`,
        method: 'POST',
        body: { parentNote },
      }),
      invalidatesTags: ['Approval', 'Family'],
    }),
  }),
});

export const {
  useGetFamilyQuery,
  useCreateChildMutation,
  useAddChildTrainerMutation,
  useRemoveChildTrainerMutation,
  useSetTokenSettingMutation,
  useCreatePurchaseRequestMutation,
  useListApprovalsQuery,
  useApproveApprovalMutation,
  useDenyApprovalMutation,
} = familyApi;
