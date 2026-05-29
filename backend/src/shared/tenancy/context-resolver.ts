import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { playerProfiles, trainerPlayerAssociations } from '@shared/database/schema';
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
  constructor(private readonly tenancy: TenancyService) {}

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
