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
    availableAt: Date = new Date(),
  ): Promise<void> {
    await tx.insert(outboxMessages).values({ type, payload, availableAt });
  }
}
