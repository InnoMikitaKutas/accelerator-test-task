import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { playerProfiles, trainerPlayerAssociations, trainerProfiles, users } from '@shared/database/schema';
import { TenancyService } from '@shared/tenancy/tenancy.service';

export interface SubjectChannel {
  playerProfileId: string;
  trainerId: string;
  name: string;
}

@Injectable()
export class ContextRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly tenancy: TenancyService,
  ) {}

  /**
   * Zone-1 account read spanning trainers — runs as the user (app.current_user_id GUC) so the
   * dual-axis RLS policy permits reading the caller's associations under FORCE RLS (R2).
   */
  async getSubjects(
    userId: string,
  ): Promise<{ profiles: (typeof playerProfiles.$inferSelect)[]; channels: SubjectChannel[] }> {
    return this.tenancy.runAsUser(async (tx) => {
      const profiles = await tx
        .select()
        .from(playerProfiles)
        .where(
          and(
            or(eq(playerProfiles.userId, userId), eq(playerProfiles.parentUserId, userId)),
            isNull(playerProfiles.deletedAt),
          ),
        );
      const ids = profiles.map((p) => p.id);
      const channels = ids.length
        ? await tx
            .select({
              playerProfileId: trainerPlayerAssociations.playerProfileId,
              trainerId: trainerProfiles.id,
              name: trainerProfiles.businessName,
            })
            .from(trainerPlayerAssociations)
            .innerJoin(trainerProfiles, eq(trainerProfiles.id, trainerPlayerAssociations.trainerId))
            .where(
              and(
                inArray(trainerPlayerAssociations.playerProfileId, ids),
                eq(trainerPlayerAssociations.status, 'active'),
              ),
            )
        : [];
      return { profiles, channels };
    });
  }

  async getUserDefaults(userId: string): Promise<{ subjectProfileId: string | null; trainerId: string | null }> {
    const [u] = await this.db
      .select({ s: users.defaultSubjectProfileId, t: users.defaultTrainerId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return { subjectProfileId: u?.s ?? null, trainerId: u?.t ?? null };
  }

  async setDefault(userId: string, subjectProfileId: string, trainerId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ defaultSubjectProfileId: subjectProfileId, defaultTrainerId: trainerId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
