import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_FORCED_CHANGE, IS_PUBLIC } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { SessionPrincipal } from '@shared/context/request-context';

/** Forces temp-password users to change before any other action (FR-005). */
@Injectable()
export class ForcePasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const bypass = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_FORCED_CHANGE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (bypass || allowed) return true;

    const user = ctx.switchToHttp().getRequest<Request & { user?: SessionPrincipal }>().user;
    if (user?.mustChangePassword) throw new AppException(AppErrorCode.FORCE_PASSWORD_CHANGE);
    return true;
  }
}
