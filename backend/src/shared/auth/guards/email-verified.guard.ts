import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_UNVERIFIED, IS_PUBLIC } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { SessionPrincipal } from '@shared/context/request-context';

/** Blocks unverified users (FR-003/D-1) except on @Public or @AllowUnverified routes. */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const bypass = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (bypass || allowUnverified) return true;

    const user = ctx.switchToHttp().getRequest<Request & { user?: SessionPrincipal }>().user;
    if (user && !user.emailVerified) throw new AppException(AppErrorCode.EMAIL_NOT_VERIFIED);
    return true;
  }
}
