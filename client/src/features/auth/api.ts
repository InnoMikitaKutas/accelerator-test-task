import type { FetchBaseQueryError, FetchBaseQueryMeta } from '@reduxjs/toolkit/query';
import { api } from '@/services/api';
import type { SessionUser } from '@/types/api';
import { setSession, clearSession, setSessionLoading } from '@/features/session/sessionSlice';

/**
 * Module A — Auth (api-designer-spec §Module A). Cookie-based: every response sets
 * httpOnly `at`/`rt`/`csrf`; bodies never carry tokens (F-4). The principal comes
 * from GET /auth/me, mirrored into the `session` slice via onQueryStarted so the
 * shell/guards read one source of truth.
 *
 * Request DTOs live here with the feature (the plan keeps response shapes in
 * types/api.ts and request shapes beside their endpoints).
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  newPassword: string;
  /** Required for a normal change; omitted under the temp-password (forced) flow. */
  currentPassword?: string;
  /** Set by ForcedPasswordChange so the server skips the currentPassword check (FR-005). */
  fromTempPassword?: boolean;
}

/**
 * RATE_LIMITED responses carry a `Retry-After` header (api-spec error catalog) that
 * RTK Query does not expose to components. Fold it onto the error `data` so
 * `parseApiError` surfaces `retryAfterSeconds` uniformly (the login countdown).
 */
function foldRetryAfter(
  error: FetchBaseQueryError,
  meta: FetchBaseQueryMeta | undefined,
): FetchBaseQueryError {
  const header = meta?.response?.headers.get('Retry-After');
  // Retry-After only rides on a real HTTP response (numeric status); leave the
  // network/parse error variants untouched.
  if (!header || typeof error.status !== 'number') return error;
  const seconds = Number(header);
  if (!Number.isFinite(seconds)) return error;
  const data = error.data && typeof error.data === 'object' ? error.data : {};
  return { status: error.status, data: { ...data, retryAfterSeconds: seconds } };
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    // GET /auth/me — hydrates the session on app load and after a rotation.
    me: build.query<SessionUser, void>({
      query: () => '/auth/me',
      providesTags: ['Session'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        dispatch(setSessionLoading());
        try {
          const { data } = await queryFulfilled;
          dispatch(setSession(data));
        } catch {
          // Not signed in (or baseQuery's refusal to refresh): settle to a known state.
          dispatch(clearSession());
        }
      },
    }),

    // POST /auth/login — 200 + Set-Cookie; body is the principal, no tokens.
    login: build.mutation<SessionUser, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      transformErrorResponse: foldRetryAfter,
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setSession(data));
        } catch {
          /* surfaced to the form via the mutation result */
        }
      },
    }),

    // POST /auth/logout — best-effort: clear the local principal regardless.
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(clearSession());
        }
      },
    }),

    // POST /auth/refresh — baseQuery drives the silent refresh; exposed for completeness.
    refresh: build.mutation<void, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
    }),

    // POST /auth/verify-email — token from the email link.
    verifyEmail: build.mutation<{ verified: boolean }, VerifyEmailRequest>({
      query: (body) => ({ url: '/auth/verify-email', method: 'POST', body }),
    }),

    // POST /auth/resend-verification — always 202 (no account enumeration).
    resendVerification: build.mutation<void, ResendVerificationRequest>({
      query: (body) => ({ url: '/auth/resend-verification', method: 'POST', body }),
    }),

    // POST /auth/password/forgot — always 202 (no enumeration).
    forgotPassword: build.mutation<void, ForgotPasswordRequest>({
      query: (body) => ({ url: '/auth/password/forgot', method: 'POST', body }),
    }),

    // POST /auth/password/reset — token + new password.
    resetPassword: build.mutation<{ reset: boolean }, ResetPasswordRequest>({
      query: (body) => ({ url: '/auth/password/reset', method: 'POST', body }),
    }),

    // POST /auth/password/change — rotates the session server-side; refetch /auth/me
    // (Session tag) so mustChangePassword flips and guards re-evaluate (FR-005).
    changePassword: build.mutation<void, ChangePasswordRequest>({
      query: (body) => ({ url: '/auth/password/change', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),
  }),
});

export const {
  useMeQuery,
  useLazyMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
} = authApi;
