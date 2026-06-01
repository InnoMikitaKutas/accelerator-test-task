import { api } from '@/services/api';
import { setSession } from '@/features/session/sessionSlice';
import type {
  JoinAssociateResult,
  JoinResolve,
  Paginated,
  SessionUser,
  ShareLink,
  ShareLinkStatus,
  ShareLinkType,
} from '@/types/api';

/**
 * Module D — ShareLinks & Join (api-designer-spec §Module D).
 *
 * `/sharelinks/*` is TRAINER-only management. It is **unscoped**: the backend
 * TenantGuard derives a trainer's org from their session (resolveTrainerSelf) and does
 * NOT read X-Active-Context — only PLAYER carries one. So no `scoped: true` here.
 *
 * `/join/*` is the public registration + association surface. Like the users directory,
 * the manager overlays mutation results onto its keyset list locally (usePaginated is
 * append-only), so these mutations don't invalidate the ShareLink list tag.
 */

// `type` (not interface) to satisfy usePaginated's `A extends Record<string, unknown>`.
export type ShareLinkListArg = {
  limit?: number;
  cursor?: string;
  type?: ShareLinkType;
  status?: ShareLinkStatus;
};

export interface CreateShareLinkRequest {
  label?: string;
}

export interface CoachInviteRequest {
  email: string;
  personalNote?: string;
}

export interface JoinRegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface JoinAssociateRequest {
  /** Which owned subject to associate; defaults to self when omitted. */
  subjectProfileId?: string;
}

export const sharelinksApi = api.injectEndpoints({
  endpoints: (build) => ({
    listShareLinks: build.query<Paginated<ShareLink>, ShareLinkListArg>({
      query: ({ limit = 25, cursor, type, status }) => ({
        url: '/sharelinks',
        params: { limit, cursor, type, status },
      }),
      providesTags: ['ShareLink'],
    }),

    createStaticLink: build.mutation<ShareLink, CreateShareLinkRequest>({
      query: (body) => ({ url: '/sharelinks', method: 'POST', body }),
    }),

    createCoachInvite: build.mutation<ShareLink, CoachInviteRequest>({
      query: (body) => ({ url: '/sharelinks/coach-invite', method: 'POST', body }),
    }),

    revokeShareLink: build.mutation<void, string>({
      query: (id) => ({ url: `/sharelinks/${id}`, method: 'DELETE' }),
    }),

    // ---- Public join (no auth required to resolve) ----
    resolveJoin: build.query<JoinResolve, string>({
      query: (code) => `/join/${code}`,
    }),

    // Branch 1 — unauthenticated: register a new account; the server sets cookies and
    // returns the principal (auto-login, still unverified → L7 verify banner).
    joinRegister: build.mutation<SessionUser, { code: string; body: JoinRegisterRequest }>({
      query: ({ code, body }) => ({ url: `/join/${code}`, method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setSession(data));
        } catch {
          /* surfaced to the form */
        }
      },
    }),

    // Branch 2 — authenticated existing user: associate an owned subject. Invalidate
    // Context so the new channel appears in the switcher. (Coach invites — type:'unique'
    // — are rejected here by the backend, M1; the UI pre-empts and never calls this.)
    joinAssociate: build.mutation<JoinAssociateResult, { code: string; body: JoinAssociateRequest }>({
      query: ({ code, body }) => ({ url: `/join/${code}`, method: 'POST', body }),
      invalidatesTags: ['Context'],
    }),
  }),
});

export const {
  useListShareLinksQuery,
  useCreateStaticLinkMutation,
  useCreateCoachInviteMutation,
  useRevokeShareLinkMutation,
  useResolveJoinQuery,
  useJoinRegisterMutation,
  useJoinAssociateMutation,
} = sharelinksApi;
