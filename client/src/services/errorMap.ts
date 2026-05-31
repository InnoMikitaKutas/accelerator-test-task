import type { FieldError } from '@/types/api';

/**
 * Single source of truth for turning a server `errorCode` into a UX action.
 * Clients branch on errorCode, never on message (api-spec). Friendly copy here is
 * the default; feature screens (e.g. LoginForm) may override for their own context.
 */

export type Tone = 'info' | 'go' | 'pending' | 'foul';

export type ErrorUX =
  | { kind: 'field'; fields: FieldError[] }
  | { kind: 'banner'; tone: Tone; message: string; retryAfterSeconds?: number }
  | { kind: 'toast'; tone: Tone; message: string }
  | { kind: 'route'; to: string }
  | { kind: 'bounce' } // ContextBouncer auto-tunes to a safe default
  | { kind: 'silent' }; // already handled (baseQuery refresh/retry)

export interface MapErrorContext {
  /** Server message — used only where a passthrough is safe (never for forbiddens). */
  message?: string;
  /** VALIDATION_ERROR field errors. */
  details?: FieldError[];
  /** Parsed Retry-After header (seconds) for RATE_LIMITED. */
  retryAfterSeconds?: number;
}

export const FORCED_PASSWORD_CHANGE_ROUTE = '/forced-password-change';

export function mapError(errorCode: string, ctx: MapErrorContext = {}): ErrorUX {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
      return { kind: 'field', fields: ctx.details ?? [] };

    case 'FILE_TOO_LARGE': // M4
      return {
        kind: 'field',
        fields: [{ field: 'file', message: ctx.message ?? 'That file is too large (max 2 MB).' }],
      };
    case 'UNSUPPORTED_FILE_TYPE':
      return {
        kind: 'field',
        fields: [{ field: 'file', message: ctx.message ?? 'That file type is not supported.' }],
      };
    case 'EMAIL_EXISTS':
      return {
        kind: 'field',
        fields: [
          { field: 'email', message: ctx.message ?? 'An account with this email already exists.' },
        ],
      };

    // Recovered by baseQuery's refresh/retry — the UI stays silent.
    case 'UNAUTHENTICATED':
    case 'CSRF_INVALID':
      return { kind: 'silent' };

    case 'FORCE_PASSWORD_CHANGE':
      return { kind: 'route', to: FORCED_PASSWORD_CHANGE_ROUTE };

    case 'RATE_LIMITED':
      return {
        kind: 'banner',
        tone: 'pending',
        message: 'Too many attempts. Please wait a moment and try again.',
        retryAfterSeconds: ctx.retryAfterSeconds,
      };

    // Association went inactive / not entitled — bounce out of the broken Zone-3 (F-5).
    case 'CONTEXT_INACTIVE':
    case 'CONTEXT_FORBIDDEN':
      return { kind: 'bounce' };

    // Friendly, never the raw 403 text.
    case 'TENANT_FORBIDDEN':
    case 'FORBIDDEN_ROLE':
      return { kind: 'toast', tone: 'info', message: 'That is not available here.' };
    case 'MINOR_FORBIDDEN':
      return { kind: 'toast', tone: 'info', message: 'Ask a grown-up to do this.' };

    case 'NOT_FOUND':
      return { kind: 'toast', tone: 'info', message: 'We could not find that.' };

    default:
      return {
        kind: 'toast',
        tone: 'foul',
        message: ctx.message ?? 'Something went wrong. Please try again.',
      };
  }
}
