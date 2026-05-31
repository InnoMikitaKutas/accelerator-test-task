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

// ---- Users / Super Admin (Module B) ----

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'DELETED';

export interface UserResponse {
  id: string;
  /** "deleted-user-<uuid>@anon.invalid" after a GDPR delete. */
  email: string;
  /** "Deleted" after a GDPR delete. */
  firstName: string;
  /** "User" after a GDPR delete. */
  lastName: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Trainer org(s) this user belongs to / is associated with. */
  trainerIds?: string[];
}

export interface GdprDeleteResult {
  anonymized: boolean;
  deletionLogId: string;
  historyRetained: true;
}

// ---- Profiles (Module C) ----

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';

/** Role-specific block of a profile, discriminated by `kind` (mirrors the backend). */
export interface TrainerDetails {
  kind: 'trainer';
  businessName: string;
  businessAddress: string | null;
}
export interface CoachDetails {
  kind: 'coach';
  bio: string | null;
  credentials: string[];
  certifications: string[];
  /** Public-profile visibility toggle (FR-032). */
  publicVisible: boolean;
}
export interface PlayerDetails {
  kind: 'player';
  profileId: string;
  gender: Gender;
  school: string | null;
  /** Read-only — managed by the trainer (FR-038). */
  skillLevel: string | null;
  emergencyContact: { name: string | null; phone: string | null };
}
export type ProfileDetails = TrainerDetails | CoachDetails | PlayerDetails;

/** GET/PATCH /me/profile. `email`, `role`, and `details.skillLevel` are read-only (FR-038). */
export interface ProfileResponse {
  id: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** Foreign asset origin — render via assetUrl() + <img> (C1). */
  photoUrl: string | null;
  thumbnailUrl: string | null;
  details: ProfileDetails;
}

/** POST /me/profile/photo response (thumbnail generated async, URL ready on return). */
export interface PhotoUploadResult {
  photoUrl: string;
  thumbnailUrl: string;
}

// ---- ShareLinks & Join (Module D) ----

export type ShareLinkType = 'static' | 'unique';
/** static links are 'ACTIVE'; coach invites move PENDING→ACCEPTED/EXPIRED/REVOKED. */
export type ShareLinkStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'ACTIVE';

export interface ShareLink {
  id: string;
  type: ShareLinkType;
  /** Shareable URL, e.g. https://app/join/AB12CD. */
  url: string;
  code: string;
  /** Coach-invite target email; null for static. */
  targetEmail: string | null;
  /** ISO-8601; null for static (no expiry). */
  expiresAt: string | null;
  useCount: number;
  /** 1 for unique, null for static. */
  maxUses: number | null;
  status: ShareLinkStatus;
  active: boolean;
  createdAt: string;
}

export type JoinStatus = 'VALID' | 'EXPIRED' | 'USED' | 'INVALID';

/** Public resolve payload — minimal, no PII beyond the trainer's display name + branding. */
export interface JoinResolve {
  code: string;
  type: ShareLinkType;
  status: JoinStatus;
  trainerDisplayName: string;
  branding: { logoUrl: string | null; primaryColorHex: string } | null;
  /** Always true from the server (it can't see the cookie) — branch on the client session instead. */
  requiresAccount: boolean;
  /** Email a coach invite is bound to (locked in the register form); null for static. */
  prefillEmail: string | null;
}

/** Existing-user association result (authenticated /join consume branch). */
export interface JoinAssociateResult {
  association: { trainerId: string; playerProfileId: string; status: 'active' };
  context: ContextRef;
}

// ---- Portal branding (Module H) ----

export interface Branding {
  trainerId: string;
  logoUrl: string | null;
  primaryColorHex: string;
  updatedAt: string;
}
