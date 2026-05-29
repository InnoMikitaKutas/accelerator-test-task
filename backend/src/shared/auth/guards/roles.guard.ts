import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { SessionPrincipal } from '@shared/context/request-context';
import type { Role } from '@shared/database/schema';

/** Enforces @Roles() (FR-008/BR-001). No @Roles metadata → unrestricted (auth still required). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<Request & { user?: SessionPrincipal }>().user;
    if (!user || !roles.includes(user.role)) {
      throw new AppException(AppErrorCode.FORBIDDEN_ROLE);
    }
    return true;
  }
}
