import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { MINOR_FORBIDDEN } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { SessionPrincipal } from '@shared/context/request-context';

/** Blocks child (minor) sessions from @MinorForbidden() routes (FR-025 CANNOT-matrix). */
@Injectable()
export class MinorAccountGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const forbidden = this.reflector.getAllAndOverride<boolean>(MINOR_FORBIDDEN, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!forbidden) return true;

    const user = ctx.switchToHttp().getRequest<Request & { user?: SessionPrincipal }>().user;
    if (user?.isMinor) throw new AppException(AppErrorCode.MINOR_FORBIDDEN);
    return true;
  }
}
