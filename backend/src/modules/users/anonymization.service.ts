import { Injectable } from '@nestjs/common';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { AuditService } from '@shared/audit/audit.service';
import { TokenService } from '@shared/auth/token.service';
import { GdprDeleteDto, GdprDeleteResultDto } from './dto/user-actions.dto';
import { UsersRepository } from './users.repository';

/** FR-014/BR-010/NFR-008 — irreversible PII anonymization, history-preserving. */
@Injectable()
export class AnonymizationService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async gdprDelete(id: string, dto: GdprDeleteDto, actorId: string): Promise<GdprDeleteResultDto> {
    const user = await this.repo.findById(id);
    if (!user) throw new AppException(AppErrorCode.NOT_FOUND);

    if (dto.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppException(AppErrorCode.VALIDATION_ERROR, {
        details: [{ field: 'confirmEmail', message: 'Must equal the target email' }],
      });
    }

    const deletionLogId = await this.repo.anonymize(id, {
      deletedBy: actorId,
      reason: dto.reason,
      originalEmail: user.email,
    });
    await this.tokens.revokeAllForUser(id);
    await this.audit.log({
      action: 'user.gdpr_delete',
      entityType: 'user',
      entityId: id,
      metadata: { reason: dto.reason, deletionLogId },
    });

    return { anonymized: true, deletionLogId, historyRetained: true };
  }
}
