import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { Paginated } from '@shared/common/pagination/paginated-response.dto';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { ShareLinkRow, ShareLinksRepository } from './sharelinks.repository';
import { generateShareCode } from './sharelink.util';
import { CoachInviteDto, CreateShareLinkDto, ShareLinkResponseDto } from './dto/sharelink.dto';

const COACH_INVITE_TTL_SEC = 7 * 24 * 3600;

@Injectable()
export class ShareLinkService {
  constructor(
    private readonly repo: ShareLinksRepository,
    private readonly tenancy: TenancyService,
    private readonly config: ConfigService,
  ) {}

  /** FR-033/BR-011 — static player link: unlimited, no expiry. */
  async createStatic(createdBy: string, dto: CreateShareLinkDto): Promise<ShareLinkResponseDto> {
    const row = await this.repo.create({
      code: generateShareCode(),
      type: 'static',
      trainerId: this.tenancy.currentTrainerId(),
      createdBy,
      label: dto.label,
      status: 'ACTIVE',
      active: true,
    });
    return this.toResponse(row);
  }

  /** FR-028/033/BR-011 — unique coach invite: single-use, 7-day expiry, bound email. */
  async createCoachInvite(createdBy: string, dto: CoachInviteDto): Promise<ShareLinkResponseDto> {
    const code = generateShareCode();
    const email = dto.email.toLowerCase();
    const row = await this.repo.create(
      {
        code,
        type: 'unique',
        trainerId: this.tenancy.currentTrainerId(),
        createdBy,
        targetEmail: email,
        maxUses: 1,
        expiresAt: new Date(Date.now() + COACH_INVITE_TTL_SEC * 1000),
        status: 'PENDING',
        active: true,
      },
      {
        type: 'email.coach.invite',
        payload: { to: email, templateId: 'coach.invite', vars: { link: this.joinUrl(code) } },
      },
    );
    return this.toResponse(row);
  }

  async list(opts: { limit: number; cursor?: string; type?: string; status?: string }): Promise<Paginated<ShareLinkResponseDto>> {
    const page = await this.repo.list(opts);
    return {
      items: page.items.map((r) => this.toResponse(r)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async revoke(id: string): Promise<void> {
    const link = await this.repo.findByIdScoped(id);
    if (!link) throw new AppException(AppErrorCode.NOT_FOUND);
    await this.repo.deactivate(id);
  }

  private joinUrl(code: string): string {
    return `${this.config.get('APP_BASE_URL', 'http://localhost:5173')}/join/${code}`;
  }

  private toResponse(r: ShareLinkRow): ShareLinkResponseDto {
    return {
      id: r.id,
      type: r.type,
      url: this.joinUrl(r.code),
      code: r.code,
      targetEmail: r.targetEmail,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      useCount: r.useCount,
      maxUses: r.maxUses,
      status: r.status,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
