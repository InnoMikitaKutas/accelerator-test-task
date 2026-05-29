import { Injectable } from '@nestjs/common';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { ContextResolver } from '@shared/tenancy/context-resolver';
import { SessionPrincipal } from '@shared/context/request-context';
import { ContextRepository } from './context.repository';
import { ContextsResponseDto, SetDefaultContextDto } from './dto/context.dto';

@Injectable()
export class ContextService {
  constructor(
    private readonly repo: ContextRepository,
    private readonly resolver: ContextResolver,
  ) {}

  /** FR-019/027 — switcher data: subjects → their active trainer channels + the default. */
  async getContexts(principal: SessionPrincipal): Promise<ContextsResponseDto> {
    const { profiles, channels } = await this.repo.getSubjects(principal.id);
    const subjects = profiles.map((p) => ({
      profileId: p.id,
      displayName: `${p.firstName} ${p.lastName}`.trim(),
      isSelf: p.isSelf,
      isChild: p.isChild,
      trainers: channels
        .filter((c) => c.playerProfileId === p.id)
        .map((c) => ({ trainerId: c.trainerId, name: c.name, status: 'active' as const })),
    }));

    const d = await this.repo.getUserDefaults(principal.id);
    const defaultContext =
      d.subjectProfileId && d.trainerId
        ? { subjectProfileId: d.subjectProfileId, trainerId: d.trainerId }
        : null;

    return { subjects, defaultContext };
  }

  /** FR-019 — persist the user's default context (validated against ownership + active link). */
  async setDefault(principal: SessionPrincipal, dto: SetDefaultContextDto): Promise<void> {
    const res = await this.resolver.resolve(dto.subjectProfileId, dto.trainerId, principal.id);
    if (!res.ok) {
      throw new AppException(
        res.reason === 'inactive' ? AppErrorCode.CONTEXT_INACTIVE : AppErrorCode.CONTEXT_FORBIDDEN,
      );
    }
    await this.repo.setDefault(principal.id, dto.subjectProfileId, dto.trainerId);
  }
}
