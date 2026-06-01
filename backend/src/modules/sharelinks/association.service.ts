import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { trainerCoachAssociations, trainerPlayerAssociations } from '@shared/database/schema';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { OutboxService } from '@shared/messaging/outbox.service';

export interface AssociationResult {
  trainerId: string;
  playerProfileId: string;
  status: 'active';
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
}

/** Trainer↔user association ops. Methods take a tx so they compose in the caller's transaction. */
@Injectable()
export class AssociationService {
  constructor(private readonly outbox: OutboxService) {}

  /** Idempotent: an existing active link is returned as-is (FR-018, BR-004). */
  async associatePlayer(
    tx: DrizzleDB,
    p: { trainerId: string; playerProfileId: string; viaShareLinkId?: string },
  ): Promise<AssociationResult> {
    const [existing] = await tx
      .select()
      .from(trainerPlayerAssociations)
      .where(
        and(
          eq(trainerPlayerAssociations.trainerId, p.trainerId),
          eq(trainerPlayerAssociations.playerProfileId, p.playerProfileId),
          eq(trainerPlayerAssociations.status, 'active'),
        ),
      )
      .limit(1);
    if (existing) return { trainerId: p.trainerId, playerProfileId: p.playerProfileId, status: 'active' };

    await tx.insert(trainerPlayerAssociations).values({
      trainerId: p.trainerId,
      playerProfileId: p.playerProfileId,
      viaShareLinkId: p.viaShareLinkId,
      status: 'active',
    });
    return { trainerId: p.trainerId, playerProfileId: p.playerProfileId, status: 'active' };
  }

  /** BR-003/FR-029 — the partial-unique index enforces one active trainer per coach. */
  async associateCoach(tx: DrizzleDB, p: { trainerId: string; coachProfileId: string }): Promise<void> {
    try {
      await tx
        .insert(trainerCoachAssociations)
        .values({ trainerId: p.trainerId, coachProfileId: p.coachProfileId, status: 'active' });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppException(AppErrorCode.COACH_ALREADY_ASSIGNED);
      throw e;
    }
  }

  /** FR-023 — soft-delete the link + emit the cross-epic RSVP-cancel event via the outbox. */
  async removeAssociation(
    tx: DrizzleDB,
    p: { trainerId: string; playerProfileId: string },
  ): Promise<void> {
    await tx
      .update(trainerPlayerAssociations)
      .set({ status: 'inactive', deletedAt: new Date() })
      .where(
        and(
          eq(trainerPlayerAssociations.trainerId, p.trainerId),
          eq(trainerPlayerAssociations.playerProfileId, p.playerProfileId),
          eq(trainerPlayerAssociations.status, 'active'),
        ),
      );
    await this.outbox.enqueue(tx, 'rsvp.cancel', {
      trainerId: p.trainerId,
      playerProfileId: p.playerProfileId,
    });
  }
}
