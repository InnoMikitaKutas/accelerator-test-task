import type { ApiErrorBody, FieldError } from '@/types/api';

/**
 * Normalize an RTK Query rejection into the inputs `mapError` (and feature screens)
 * branch on. RTK Query hands components either a `FetchBaseQueryError`
 * (`{ status, data }`) or a `SerializedError` (thrown/JS error) — this reads the
 * server envelope (errorCode/message/details/canResend) off `data` and ignores
 * everything else, so callers always get `errorCode` to switch on (api-spec: never
 * branch on `message`).
 *
 * `retryAfterSeconds` is folded onto `data` by the login endpoint's
 * `transformErrorResponse` (RATE_LIMITED) — surfaced here uniformly.
 */
export interface ParsedApiError {
  /** HTTP status when the failure reached the server (absent for network errors). */
  httpStatus?: number;
  errorCode?: string;
  message?: string;
  details?: FieldError[];
  /** Login adds this on EMAIL_NOT_VERIFIED. */
  canResend?: boolean;
  /** Parsed Retry-After (seconds) for RATE_LIMITED. */
  retryAfterSeconds?: number;
}

type ServerData = Partial<ApiErrorBody> & { retryAfterSeconds?: number };

export function parseApiError(error: unknown): ParsedApiError {
  if (!error || typeof error !== 'object') return {};

  const { status, data } = error as { status?: unknown; data?: unknown };
  const out: ParsedApiError = {};

  // FetchBaseQueryError.status is the HTTP code (number) or a string tag
  // ('FETCH_ERROR' | 'PARSING_ERROR' | 'TIMEOUT_ERROR' | 'CUSTOM_ERROR').
  if (typeof status === 'number') out.httpStatus = status;

  if (data && typeof data === 'object') {
    const d = data as ServerData;
    if (typeof d.errorCode === 'string') out.errorCode = d.errorCode;
    if (typeof d.message === 'string') out.message = d.message;
    if (Array.isArray(d.details)) out.details = d.details;
    if (typeof d.canResend === 'boolean') out.canResend = d.canResend;
    if (typeof d.retryAfterSeconds === 'number') out.retryAfterSeconds = d.retryAfterSeconds;
  }

  return out;
}
