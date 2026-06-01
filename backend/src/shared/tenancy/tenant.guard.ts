import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { IS_PUBLIC, REQUIRE_CONTEXT } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { CTX_KEYS, SessionPrincipal } from '@shared/context/request-context';
import { ContextResolver } from './context-resolver';

/** Validates the X-Active-Context header on @RequireContext() routes (api-spec §Context Switching). */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: ContextResolver,
    private readonly cls: ClsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_CONTEXT, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic || !required) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionPrincipal }>();
    const user = req.user;
    if (!user) throw new AppException(AppErrorCode.UNAUTHENTICATED);

    // Role-aware tenant resolution: SUPER_ADMIN bypasses (uses the system pool); TRAINER/COACH
    // derive their own org; only PLAYER carries an X-Active-Context (subject × trainer) pair.
    if (user.role === 'SUPER_ADMIN') return true;
    if (user.role === 'TRAINER') {
      const tid = await this.resolver.resolveTrainerSelf(user.id);
      if (!tid) throw new AppException(AppErrorCode.TENANT_FORBIDDEN);
      this.cls.set(CTX_KEYS.activeTrainerId, tid);
      return true;
    }
    if (user.role === 'COACH') {
      const tid = await this.resolver.resolveCoachTrainer(user.id);
      if (!tid) throw new AppException(AppErrorCode.TENANT_FORBIDDEN);
      this.cls.set(CTX_KEYS.activeTrainerId, tid);
      return true;
    }

    const header = req.headers['x-active-context'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) {
      throw new AppException(AppErrorCode.VALIDATION_ERROR, {
        details: [{ field: 'X-Active-Context', message: 'required' }],
      });
    }
    const [subjectProfileId, trainerId] = raw.split(':');
    if (!subjectProfileId || !trainerId) {
      throw new AppException(AppErrorCode.VALIDATION_ERROR, {
        details: [{ field: 'X-Active-Context', message: 'expected "<subjectProfileId>:<trainerId>"' }],
      });
    }

    const res = await this.resolver.resolve(subjectProfileId, trainerId, user.id);
    if (!res.ok) {
      throw new AppException(
        res.reason === 'inactive' ? AppErrorCode.CONTEXT_INACTIVE : AppErrorCode.CONTEXT_FORBIDDEN,
      );
    }

    this.cls.set(CTX_KEYS.activeSubjectProfileId, subjectProfileId);
    this.cls.set(CTX_KEYS.activeTrainerId, trainerId);
    return true;
  }
}
