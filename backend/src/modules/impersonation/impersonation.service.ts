import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { Paginated } from '@shared/common/pagination/paginated-response.dto';
import { TokenService } from '@shared/auth/token.service';
import { AuditService } from '@shared/audit/audit.service';
import { CTX_KEYS } from '@shared/context/request-context';
import { AuthService, IssuedTokens } from '@modules/auth/auth.service';
import { ImpersonationRepository } from './impersonation.repository';
import {
  ImpersonationHistoryQueryDto,
  ImpersonationLogDto,
  ImpersonationStateDto,
  StartImpersonationDto,
} from './dto/impersonation.dto';

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly repo: ImpersonationRepository,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly cls: ClsService,
    private readonly config: ConfigService,
  ) {}

  /** FR-015/BR-009 — start impersonating; returns the scoped access token + state. */
  async start(
    adminId: string,
    targetUserId: string,
    dto: StartImpersonationDto,
  ): Promise<{ token: string; ttlSec: number; state: ImpersonationStateDto }> {
    const target = await this.repo.findUserById(targetUserId);
    if (!target) throw new AppException(AppErrorCode.NOT_FOUND);
    if (target.role === 'SUPER_ADMIN') throw new AppException(AppErrorCode.IMPERSONATE_SUPER_ADMIN);
    if (target.status !== 'ACTIVE') throw new AppException(AppErrorCode.ACCOUNT_INACTIVE);

    const ttlSec = Number(this.config.get('IMPERSONATION_TTL', 3600));
    const token = await this.tokens.issueImpersonation(this.auth.claimsFrom(target), adminId);
    await this.repo.startLog(adminId, targetUserId, dto.reason);
    await this.audit.log({ action: 'impersonation.start', entityType: 'user', entityId: targetUserId });

    return {
      token,
      ttlSec,
      state: {
        impersonating: true,
        targetUserId,
        targetDisplayName: `${target.firstName} ${target.lastName}`.trim(),
        expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
      },
    };
  }

  /** FR-015 — end impersonation; re-issues the admin session. Idempotent if not impersonating. */
  async exit(): Promise<{ state: ImpersonationStateDto; tokens?: IssuedTokens }> {
    const adminId = this.cls.get<string>(CTX_KEYS.impersonatorAdminId);
    const notImpersonating: ImpersonationStateDto = {
      impersonating: false,
      targetUserId: null,
      targetDisplayName: null,
      expiresAt: null,
    };
    if (!adminId) return { state: notImpersonating };

    await this.repo.closeOpenLog(adminId);
    const admin = await this.repo.findUserById(adminId);
    if (!admin) return { state: notImpersonating };

    await this.audit.log({ action: 'impersonation.exit', entityType: 'user', entityId: admin.id });
    const tokens = await this.tokens.issueSession(this.auth.claimsFrom(admin));
    return { state: notImpersonating, tokens };
  }

  history(query: ImpersonationHistoryQueryDto): Promise<Paginated<ImpersonationLogDto>> {
    return this.repo.history(query);
  }
}
