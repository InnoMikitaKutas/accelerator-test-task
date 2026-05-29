import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { Paginated } from '@shared/common/pagination/paginated-response.dto';
import { OutboxService } from '@shared/messaging/outbox.service';
import { SessionPrincipal } from '@shared/context/request-context';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { ApprovalRow, FamilyRepository } from './family.repository';
import { ApprovalDecisionDto, ApprovalResponseDto, PurchaseRequestDto } from './dto/family.dto';

@Injectable()
export class PurchaseApprovalService {
  constructor(
    private readonly repo: FamilyRepository,
    private readonly tenancy: TenancyService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /** FR-024/BR-008 — USD always needs approval; TOKEN obeys the child's setting. 48h window. */
  async createRequest(principal: SessionPrincipal, dto: PurchaseRequestDto): Promise<ApprovalResponseDto> {
    const trainerId = this.tenancy.currentTrainerId(); // route is @RequireContext
    const child = await this.repo.getChildById(dto.childProfileId);
    if (!child) throw new AppException(AppErrorCode.NOT_FOUND);
    const owned = child.userId === principal.id || child.parentUserId === principal.id;
    if (!owned) throw new AppException(AppErrorCode.TENANT_FORBIDDEN);

    const parentUserId = child.parentUserId ?? child.userId;
    const allowToken = await this.repo.getTokenSetting(dto.childProfileId);
    const autoApprove = dto.paymentType === 'TOKEN' && allowToken;
    const status = autoApprove ? 'APPROVED' : 'PENDING';
    const ttl = Number(this.config.get('APPROVAL_TTL', 172800));

    const row = await this.repo.createApproval(trainerId, {
      childProfileId: dto.childProfileId,
      parentUserId,
      trainerId,
      itemRef: dto.itemRef,
      paymentType: dto.paymentType,
      amount: dto.amount ?? null,
      status,
      expiresAt: new Date(Date.now() + ttl * 1000),
      childNote: dto.childNote,
      respondedAt: autoApprove ? new Date() : null,
    });

    if (status === 'PENDING') {
      const parentEmail = await this.repo.getUserEmail(parentUserId);
      if (parentEmail) {
        const base = this.config.get('APP_BASE_URL', 'http://localhost:5173');
        await this.db.transaction((tx) =>
          this.outbox.enqueue(tx, 'email.child.approval-request', {
            to: parentEmail,
            templateId: 'child.approval-request',
            vars: { childName: `${child.firstName} ${child.lastName}`.trim(), item: dto.itemRef, link: `${base}/family` },
          }),
        );
      }
    }
    return this.toResponse(row, `${child.firstName} ${child.lastName}`.trim());
  }

  async approve(principal: SessionPrincipal, id: string, dto: ApprovalDecisionDto): Promise<ApprovalResponseDto> {
    return this.decide(principal, id, 'APPROVED', dto);
  }

  async deny(principal: SessionPrincipal, id: string, dto: ApprovalDecisionDto): Promise<ApprovalResponseDto> {
    return this.decide(principal, id, 'DENIED', dto);
  }

  async get(parentUserId: string, id: string): Promise<ApprovalResponseDto> {
    const a = await this.repo.findApproval(parentUserId, id);
    if (!a) throw new AppException(AppErrorCode.NOT_FOUND);
    return this.toResponse(a, a.childDisplayName);
  }

  async list(
    parentUserId: string,
    opts: { limit: number; cursor?: string; status?: string; childProfileId?: string },
  ): Promise<Paginated<ApprovalResponseDto>> {
    const page = await this.repo.listApprovals(parentUserId, opts);
    return {
      items: page.items.map((a) => this.toResponse(a, a.childDisplayName)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  private async decide(
    principal: SessionPrincipal,
    id: string,
    status: 'APPROVED' | 'DENIED',
    dto: ApprovalDecisionDto,
  ): Promise<ApprovalResponseDto> {
    const a = await this.repo.findApproval(principal.id, id);
    if (!a) throw new AppException(AppErrorCode.NOT_FOUND);
    if (a.status !== 'PENDING') throw new AppException(AppErrorCode.APPROVAL_ALREADY_DECIDED);
    if (a.expiresAt.getTime() < Date.now()) throw new AppException(AppErrorCode.APPROVAL_EXPIRED);

    await this.repo.decideApproval(id, status, dto.parentNote);
    return this.toResponse({ ...a, status, respondedAt: new Date(), parentNote: dto.parentNote ?? null }, a.childDisplayName);
  }

  /** Lazy expiry: a PENDING request past its window reads as EXPIRED (BR-008 auto-deny). */
  private toResponse(a: ApprovalRow, childDisplayName: string): ApprovalResponseDto {
    const expired = a.status === 'PENDING' && a.expiresAt.getTime() < Date.now();
    return {
      id: a.id,
      childProfileId: a.childProfileId,
      childDisplayName,
      trainerId: a.trainerId,
      itemRef: a.itemRef,
      paymentType: a.paymentType,
      amount: a.amount,
      status: expired ? 'EXPIRED' : a.status,
      requestedAt: a.requestedAt.toISOString(),
      expiresAt: a.expiresAt.toISOString(),
      respondedAt: a.respondedAt ? a.respondedAt.toISOString() : null,
      parentNote: a.parentNote,
    };
  }
}
