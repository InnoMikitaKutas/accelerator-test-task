import { Injectable } from '@nestjs/common';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { outboxMessages } from '@shared/database/schema';

/** Transactional outbox writer. Always called with the SAME tx as the state change. */
@Injectable()
export class OutboxService {
  async enqueue(
    tx: DrizzleDB,
    type: string,
    payload: Record<string, unknown>,
    opts: { availableAt?: Date; dedupeKey?: string } = {},
  ): Promise<void> {
    await tx
      .insert(outboxMessages)
      .values({ type, payload, availableAt: opts.availableAt ?? new Date(), dedupeKey: opts.dedupeKey })
      // Idempotent on dedupeKey (NFR-008): a duplicate enqueue with the same key is a no-op.
      .onConflictDoNothing();
  }
}
