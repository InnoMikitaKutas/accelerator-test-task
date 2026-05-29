import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { IS_PUBLIC } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { CTX_KEYS, SessionPrincipal } from '@shared/context/request-context';
import { TokenService } from '../token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionPrincipal }>();
    const token = req.cookies?.['at'] as string | undefined;
    if (!token) throw new AppException(AppErrorCode.UNAUTHENTICATED);

    let claims;
    try {
      claims = await this.tokens.verifyAccess(token);
    } catch {
      throw new AppException(AppErrorCode.UNAUTHENTICATED);
    }

    // Impersonation hard expiry (FR-015).
    if (claims.impersonationExp && claims.impersonationExp < Math.floor(Date.now() / 1000)) {
      throw new AppException(AppErrorCode.UNAUTHENTICATED);
    }

    const principal: SessionPrincipal = {
      id: claims.sub,
      role: claims.role,
      email: claims.email,
      emailVerified: claims.emailVerified,
      mustChangePassword: claims.mustChangePassword,
      isMinor: claims.isMinor,
      managedByParentUserId: claims.managedByParentUserId ?? null,
      family: claims.family,
    };
    req.user = principal;
    this.cls.set(CTX_KEYS.user, principal);
    if (claims.impersonatorAdminId) {
      this.cls.set(CTX_KEYS.impersonatorAdminId, claims.impersonatorAdminId);
    }
    return true;
  }
}
