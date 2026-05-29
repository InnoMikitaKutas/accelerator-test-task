import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import {
  coachProfiles,
  playerProfiles,
  trainerCoachAssociations,
  trainerProfiles,
  trainerPlayerAssociations,
} from '@shared/database/schema';
import { TenancyService } from './tenancy.service';

export type ContextResolution =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'inactive' };

/**
 * Authorizes an X-Active-Context (subjectProfileId, trainerId) for a user:
 *   (a) the subject player profile is owned/parented by the user, and
 *   (b) a matching (subject, trainer) association exists and is active.
 * Runs as the user (app.current_user_id GUC) so the association read is RLS-legal pre-resolution.
 */
@Injectable()
export class ContextResolver {
  constructor(
    private readonly tenancy: TenancyService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /** A trainer's own tenant = their trainer_profiles.id (P-1). trainer_profiles is not RLS-scoped. */
  async resolveTrainerSelf(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.userId, userId))
      .limit(1);
    return row?.id ?? null;
  }

  /** A coach's tenant = their single active trainer (BR-003). Reads an RLS table → runAsUser. */
  resolveCoachTrainer(userId: string): Promise<string | null> {
    return this.tenancy.runAsUser(async (tx) => {
      const [row] = await tx
        .select({ trainerId: trainerCoachAssociations.trainerId })
        .from(trainerCoachAssociations)
        .innerJoin(coachProfiles, eq(coachProfiles.id, trainerCoachAssociations.coachProfileId))
        .where(and(eq(coachProfiles.userId, userId), eq(trainerCoachAssociations.status, 'active')))
        .limit(1);
      return row?.trainerId ?? null;
    });
  }

  resolve(subjectProfileId: string, trainerId: string, userId: string): Promise<ContextResolution> {
    return this.tenancy.runAsUser(async (tx): Promise<ContextResolution> => {
      const [profile] = await tx
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.id, subjectProfileId))
        .limit(1);
      if (!profile) return { ok: false, reason: 'forbidden' };

      const owned = profile.userId === userId || profile.parentUserId === userId;
      if (!owned) return { ok: false, reason: 'forbidden' };

      const [assoc] = await tx
        .select()
        .from(trainerPlayerAssociations)
        .where(
          and(
            eq(trainerPlayerAssociations.playerProfileId, subjectProfileId),
            eq(trainerPlayerAssociations.trainerId, trainerId),
          ),
        )
        .orderBy(desc(trainerPlayerAssociations.connectedAt))
        .limit(1);
      if (!assoc) return { ok: false, reason: 'forbidden' };
      if (assoc.status !== 'active') return { ok: false, reason: 'inactive' };
      return { ok: true };
    });
  }
}
