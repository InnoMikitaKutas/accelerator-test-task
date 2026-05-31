/**
 * Shared API types — mirror specs/api-designer-spec.md verbatim. Add nothing the
 * spec doesn't show. Response shapes only (request DTOs live with their features).
 */

export type Role = 'SUPER_ADMIN' | 'TRAINER' | 'COACH' | 'PLAYER';

/** `<subjectProfileId>:<trainerId>` pair — the per-request active context (F-5). */
export interface ContextRef {
  subjectProfileId: string;
  trainerId: string;
}

/** GET /auth/me, POST /auth/login response. Carries NO tokens (cookies do). */
export interface SessionUser {
  id: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  defaultContext?: ContextRef | null;
  /** Present when this session is an active impersonation (Module G). */
  impersonatedBy?: ImpersonatorRef | null;
}

export interface ImpersonatorRef {
  id: string;
  email: string;
  /** ISO-8601 — the 1h hard expiry of the impersonation (H1). */
  expiresAt: string;
}

/** Standard error envelope. Clients branch on `errorCode`, never `message`. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  errorCode: string;
  message: string;
  /** Populated only for VALIDATION_ERROR. */
  details?: FieldError[];
  /** Login adds this on EMAIL_NOT_VERIFIED. */
  canResend?: boolean;
}

export interface FieldError {
  field: string;
  message: string;
}

/** Opaque-cursor keyset pagination (NFR-002). `nextCursor` is opaque — never parse it (L6). */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---- Context switcher (Module: /me/contexts) ----

export interface TrainerChannel {
  trainerId: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface Subject {
  profileId: string;
  displayName: string;
  isSelf: boolean;
  isChild: boolean;
  trainers: TrainerChannel[];
}

export interface ContextsResponse {
  subjects: Subject[];
  defaultContext: ContextRef | null;
}

// ---- Portal branding (Module H) ----

export interface Branding {
  trainerId: string;
  logoUrl: string | null;
  primaryColorHex: string;
  updatedAt: string;
}
