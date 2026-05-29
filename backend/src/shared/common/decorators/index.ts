import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@shared/database/schema';
import type { SessionPrincipal } from '@shared/context/request-context';

export const IS_PUBLIC = 'isPublic';
/** Marks a route as requiring NO authentication (skips the whole guard chain's auth checks). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the given role(s) (RolesGuard, FR-008). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const REQUIRE_CONTEXT = 'requireContext';
/** Requires a valid X-Active-Context header, resolved by TenantGuard. */
export const RequireContext = () => SetMetadata(REQUIRE_CONTEXT, true);

export const ALLOW_FORCED_CHANGE = 'allowForcedChange';
/** Permits a route even when the user is under FORCE_PASSWORD_CHANGE (e.g. change-password, logout, me). */
export const AllowDuringForcedChange = () => SetMetadata(ALLOW_FORCED_CHANGE, true);

export const ALLOW_UNVERIFIED = 'allowUnverified';
/**
 * Permits a route for an authenticated-but-unverified user (architect review R4): the small set
 * of actions a freshly-registered user needs before verifying — me, logout, resend, verify, change.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED, true);

export const MINOR_FORBIDDEN = 'minorForbidden';
/** Blocks child (minor) sessions from a route (MinorAccountGuard, FR-025). */
export const MinorForbidden = () => SetMetadata(MINOR_FORBIDDEN, true);

/** Injects the authenticated principal (populated by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionPrincipal =>
    ctx.switchToHttp().getRequest().user,
);
