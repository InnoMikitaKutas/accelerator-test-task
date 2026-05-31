import type { ParsedApiError } from '@/services/apiError';
import type { FieldError } from '@/types/api';

/**
 * LoginForm's own error→UX classification (frontend-design-spec §LoginForm). The
 * generic errorMap can't model login's affordances (the Resend action, the
 * inactive-vs-invalid distinction, the rate-limit countdown), so login overrides —
 * which the errorMap module explicitly allows. Branch on errorCode, never message.
 *
 * `VALIDATION_ERROR` is intentionally NOT a banner: those map to field errors
 * (see `validationFieldErrors`).
 */
export type LoginErrorView =
  | { kind: 'none' }
  /** 401 — deliberately generic, no user enumeration. */
  | { kind: 'invalid' }
  /** 403 EMAIL_NOT_VERIFIED — amber + a Resend affordance when canResend. */
  | { kind: 'unverified'; canResend: boolean }
  /** 403 ACCOUNT_INACTIVE — neutral, distinct from invalid credentials (L3). */
  | { kind: 'inactive' }
  /** 429 — disable submit + count down from Retry-After. */
  | { kind: 'rateLimited'; retryAfterSeconds?: number }
  /** Anything else — a generic foul banner. */
  | { kind: 'error'; message: string };

const FALLBACK = 'Something went wrong. Please try again.';

export function classifyLoginError(parsed: ParsedApiError): LoginErrorView {
  switch (parsed.errorCode) {
    case 'INVALID_CREDENTIALS':
      return { kind: 'invalid' };
    case 'EMAIL_NOT_VERIFIED':
      return { kind: 'unverified', canResend: parsed.canResend ?? false };
    case 'ACCOUNT_INACTIVE':
      return { kind: 'inactive' };
    case 'RATE_LIMITED':
      return { kind: 'rateLimited', retryAfterSeconds: parsed.retryAfterSeconds };
    // Handled as field errors, not a banner.
    case 'VALIDATION_ERROR':
      return { kind: 'none' };
    default:
      return { kind: 'error', message: parsed.message ?? FALLBACK };
  }
}

/** Field errors to push onto the form when the server returns VALIDATION_ERROR. */
export function validationFieldErrors(parsed: ParsedApiError): FieldError[] {
  return parsed.errorCode === 'VALIDATION_ERROR' ? (parsed.details ?? []) : [];
}
