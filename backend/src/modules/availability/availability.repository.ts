import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import {
  availability,
  availabilityOverrides,
  coachProfiles,
  playerProfiles,
  trainerPlayerAssociations,
  trainerProfiles,
} from '@shared/database/schema';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { TimeSlotDto } from './dto/availability.dto';

export type AvailabilityRow = typeof availability.$inferSelect;

@Injectable()
export class AvailabilityRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly tenancy: TenancyService,
  ) {}

  // availability is NOT tenant-owned (P-4 shared-per-subject) → app pool, ownership enforced in service.
  getSlots(subjectType: 'player' | 'coach', subjectId: string): Promise<AvailabilityRow[]> {
    return this.db
      .select()
      .from(availability)
      .where(and(eq(availability.subjectType, subjectType), eq(availability.subjectId, subjectId)));
  }

  /** Full replace (PUT semantics): delete-all + insert-new in one tx. */
  async replaceSlots(
    subjectType: 'player' | 'coach',
    subjectId: string,
    slots: TimeSlotDto[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(availability)
        .where(and(eq(availability.subjectType, subjectType), eq(availability.subjectId, subjectId)));
      if (slots.length) {
        await tx.insert(availability).values(
          slots.map((s) => ({
            subjectType,
            subjectId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        );
      }
    });
  }

  getCoachProfile(id: string) {
    return this.db.select().from(coachProfiles).where(eq(coachProfiles.id, id)).limit(1).then((r) => r[0]);
  }

  getPlayerProfile(id: string) {
    return this.db.select().from(playerProfiles).where(eq(playerProfiles.id, id)).limit(1).then((r) => r[0]);
  }

  /** Active (trainer, player) link — scoped read so RLS permits it for the trainer. */
  getActiveAssociation(trainerId: string, playerProfileId: string) {
    return this.tenancy.runScoped(async (tx) => {
      const [a] = await tx
        .select()
        .from(trainerPlayerAssociations)
        .where(
          and(
            eq(trainerPlayerAssociations.trainerId, trainerId),
            eq(trainerPlayerAssociations.playerProfileId, playerProfileId),
            eq(trainerPlayerAssociations.status, 'active'),
          ),
        )
        .limit(1);
      return a;
    }, trainerId);
  }

  /** Players associated with a trainer (id + display name) — scoped. */
  listAssociatedPlayers(trainerId: string): Promise<{ playerProfileId: string; firstName: string; lastName: string }[]> {
    return this.tenancy.runScoped(async (tx) => {
      return tx
        .select({
          playerProfileId: playerProfiles.id,
          firstName: playerProfiles.firstName,
          lastName: playerProfiles.lastName,
        })
        .from(trainerPlayerAssociations)
        .innerJoin(playerProfiles, eq(playerProfiles.id, trainerPlayerAssociations.playerProfileId))
        .where(and(eq(trainerPlayerAssociations.trainerId, trainerId), eq(trainerPlayerAssociations.status, 'active')));
    }, trainerId);
  }

  getSlotsForSubjects(subjectIds: string[]): Promise<AvailabilityRow[]> {
    if (subjectIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(availability)
      .where(and(eq(availability.subjectType, 'player'), inArray(availability.subjectId, subjectIds)));
  }

  createOverride(values: typeof availabilityOverrides.$inferInsert) {
    return this.tenancy.runScoped(async (tx) => {
      const [row] = await tx.insert(availabilityOverrides).values(values).returning();
      return row;
    });
  }

  trainerExistsForCoach(coachId: string): Promise<boolean> {
    // (placeholder for Epic-02 event linkage validation; coach must exist)
    return this.db
      .select({ id: coachProfiles.id })
      .from(coachProfiles)
      .where(eq(coachProfiles.id, coachId))
      .limit(1)
      .then((r) => r.length > 0);
  }

  trainerProfileById(id: string): Promise<boolean> {
    return this.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.id, id))
      .limit(1)
      .then((r) => r.length > 0);
  }
}
