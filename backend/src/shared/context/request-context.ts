import type { Role } from '@shared/database/schema';

/** Minimal authenticated principal, derived from the access-token claims. */
export interface SessionPrincipal {
  id: string;
  role: Role;
  email: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  isMinor: boolean;
  managedByParentUserId: string | null;
  /** Refresh-token family id (for logout/rotation revocation). */
  family?: string;
}

export interface RequestContextShape {
  user?: SessionPrincipal;
  impersonatorAdminId?: string; // present while a Super Admin impersonates (FR-015)
  activeSubjectProfileId?: string; // from X-Active-Context (TenantGuard)
  activeTrainerId?: string; // from X-Active-Context → ScopedRepository + RLS GUC
  ip?: string;
}

/** CLS storage keys (nestjs-cls). */
export const CTX_KEYS = {
  user: 'user',
  impersonatorAdminId: 'impersonatorAdminId',
  activeSubjectProfileId: 'activeSubjectProfileId',
  activeTrainerId: 'activeTrainerId',
  ip: 'ip',
} as const;
