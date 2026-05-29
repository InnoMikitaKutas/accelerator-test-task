import { Injectable } from '@nestjs/common';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { Paginated } from '@shared/common/pagination/paginated-response.dto';
import { ContextResolver } from '@shared/tenancy/context-resolver';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { AuditService } from '@shared/audit/audit.service';
import { SessionPrincipal } from '@shared/context/request-context';
import { AvailabilityRepository } from './availability.repository';
import {
  AvailabilityResponseDto,
  OverrideDto,
  SetAvailabilityDto,
  TimeSlotDto,
  TrainerAvailabilityQueryDto,
} from './dto/availability.dto';
import { hhmm, validateSlots } from './availability.util';

export interface TrainerPlayerAvailability {
  playerProfileId: string;
  displayName: string;
  slots: TimeSlotDto[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly repo: AvailabilityRepository,
    private readonly resolver: ContextResolver,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async getFor(
    principal: SessionPrincipal,
    subjectType: string,
    subjectId: string,
  ): Promise<AvailabilityResponseDto> {
    const st = this.assertSubjectType(subjectType);
    await this.authorize(principal, st, subjectId, false);
    return this.read(st, subjectId);
  }

  async setFor(
    principal: SessionPrincipal,
    subjectType: string,
    subjectId: string,
    dto: SetAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    const st = this.assertSubjectType(subjectType);
    await this.authorize(principal, st, subjectId, true);
    validateSlots(dto.slots);
    await this.repo.replaceSlots(st, subjectId, dto.slots);
    return this.read(st, subjectId);
  }

  /** FR-034 — trainer view of associated players' Best Times + filters. Advisory (BR-012). */
  async trainerView(
    query: TrainerAvailabilityQueryDto,
  ): Promise<Paginated<TrainerPlayerAvailability>> {
    const trainerId = this.tenancy.currentTrainerId();
    const players = await this.repo.listAssociatedPlayers(trainerId);
    const slots = await this.repo.getSlotsForSubjects(players.map((p) => p.playerProfileId));

    const slotsByPlayer = new Map<string, TimeSlotDto[]>();
    for (const s of slots) {
      const arr = slotsByPlayer.get(s.subjectId) ?? [];
      arr.push({ dayOfWeek: s.dayOfWeek, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) });
      slotsByPlayer.set(s.subjectId, arr);
    }

    const search = query.search?.toLowerCase();
    const items = players
      .map((p) => ({
        playerProfileId: p.playerProfileId,
        displayName: `${p.firstName} ${p.lastName}`.trim(),
        slots: slotsByPlayer.get(p.playerProfileId) ?? [],
      }))
      .filter((p) => (search ? p.displayName.toLowerCase().includes(search) : true))
      .filter((p) => this.matchesTimeFilter(p.slots, query));

    // Per-trainer player lists are bounded; full keyset pagination is a follow-up.
    return { items, nextCursor: null, hasMore: false };
  }

  /** FR-031/035 — log a coach availability override with a required reason. */
  async createOverride(principal: SessionPrincipal, dto: OverrideDto) {
    const trainerId = this.tenancy.currentTrainerId();
    if (!(await this.repo.trainerExistsForCoach(dto.coachId))) {
      throw new AppException(AppErrorCode.NOT_FOUND);
    }
    const row = await this.repo.createOverride({
      eventId: dto.eventId,
      coachId: dto.coachId,
      trainerId,
      overriddenBy: principal.id,
      reason: dto.reason,
    });
    await this.audit.log({
      action: 'availability.override',
      entityType: 'availability_override',
      entityId: row.id,
      metadata: { eventId: dto.eventId, coachId: dto.coachId, reason: dto.reason },
    });
    return {
      id: row.id,
      eventId: row.eventId,
      coachId: row.coachId,
      overriddenBy: row.overriddenBy,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private assertSubjectType(s: string): 'player' | 'coach' {
    if (s !== 'player' && s !== 'coach') {
      throw new AppException(AppErrorCode.VALIDATION_ERROR, {
        details: [{ field: 'subjectType', message: 'must be "player" or "coach"' }],
      });
    }
    return s;
  }

  private async read(st: 'player' | 'coach', subjectId: string): Promise<AvailabilityResponseDto> {
    const rows = await this.repo.getSlots(st, subjectId);
    const updatedAt = rows.reduce<Date | null>(
      (max, r) => (!max || r.updatedAt > max ? r.updatedAt : max),
      null,
    );
    return {
      subjectType: st,
      subjectId,
      slots: rows.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: hhmm(r.startTime), endTime: hhmm(r.endTime) })),
      updatedAt: (updatedAt ?? new Date()).toISOString(),
    };
  }

  /** Owner can read+write; an associated trainer may read a player's Best Times (FR-034). */
  private async authorize(
    principal: SessionPrincipal,
    st: 'player' | 'coach',
    subjectId: string,
    write: boolean,
  ): Promise<void> {
    if (st === 'coach') {
      const coach = await this.repo.getCoachProfile(subjectId);
      if (!coach) throw new AppException(AppErrorCode.NOT_FOUND);
      if (coach.userId !== principal.id) throw new AppException(AppErrorCode.TENANT_FORBIDDEN);
      return;
    }
    const player = await this.repo.getPlayerProfile(subjectId);
    if (!player) throw new AppException(AppErrorCode.NOT_FOUND);
    const isOwner = player.userId === principal.id || player.parentUserId === principal.id;
    if (isOwner) return;
    if (!write && principal.role === 'TRAINER') {
      const trainerId = await this.resolver.resolveTrainerSelf(principal.id);
      if (trainerId && (await this.repo.getActiveAssociation(trainerId, subjectId))) return;
    }
    throw new AppException(AppErrorCode.TENANT_FORBIDDEN);
  }

  private matchesTimeFilter(slots: TimeSlotDto[], q: TrainerAvailabilityQueryDto): boolean {
    if (q.dayOfWeek === undefined && !q.availableAt) return true;
    return slots.some((s) => {
      if (q.dayOfWeek !== undefined && s.dayOfWeek !== q.dayOfWeek) return false;
      if (q.availableAt && !(s.startTime <= q.availableAt && q.availableAt < s.endTime)) return false;
      return true;
    });
  }
}
