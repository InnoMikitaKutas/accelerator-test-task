import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { SYSTEM_DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { outboxMessages } from '@shared/database/schema';
import { MailerService } from '@shared/mailer/mailer.service';
import type { MailTemplateId } from '@shared/mailer/templates';

interface EmailPayload {
  to: string;
  templateId: MailTemplateId;
  vars: Record<string, string>;
}

/**
 * Polls the outbox on the SYSTEM (BYPASSRLS) pool and dispatches messages (architect review R1/R7).
 * `email.*` → MailerService; cross-epic events (rsvp.cancel, payment.*) are logged until their
 * consumers land (Epic-02/05).
 *
 * Reliability (NFR-008): each tick CLAIMS a batch in a short tx (FOR UPDATE SKIP LOCKED) by leasing
 * the rows — pushing availableAt to now+lease and incrementing attempts — then COMMITS, then SENDS
 * each message with NO db locks held, then MARKS the result per row. This is **at-least-once**
 * (a crash after send but before mark re-sends once the lease lapses), which is acceptable for
 * email; the `dedupeKey` on enqueue prevents duplicate *enqueues*. Permanent failures back off
 * exponentially and dead-letter (DEAD) after MAX_ATTEMPTS so one poison message can't head-of-line
 * block the queue or retry forever.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly MAX_ATTEMPTS = 6;

  constructor(
    @Inject(SYSTEM_DRIZZLE) private readonly db: DrizzleDB,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private get leaseMs(): number {
    return Number(this.config.get('OUTBOX_LEASE_MS', 30_000));
  }

  onModuleInit(): void {
    if (this.config.get('OUTBOX_RELAY_ENABLED', 'true') === 'false') return;
    const ms = Number(this.config.get('OUTBOX_POLL_MS', 5000));
    this.timer = setInterval(() => void this.tick(), ms);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // 1) CLAIM: lease a batch in its own short tx (no network I/O under lock).
      const claimed = await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(outboxMessages)
          .where(and(eq(outboxMessages.status, 'PENDING'), lte(outboxMessages.availableAt, new Date())))
          .orderBy(outboxMessages.availableAt)
          .limit(20)
          .for('update', { skipLocked: true });
        if (rows.length) {
          const leaseUntil = new Date(Date.now() + this.leaseMs);
          await tx
            .update(outboxMessages)
            .set({ availableAt: leaseUntil, attempts: sql`${outboxMessages.attempts} + 1` })
            .where(
              inArray(
                outboxMessages.id,
                rows.map((r) => r.id),
              ),
            );
        }
        return rows;
      });

      // 2) SEND each OUTSIDE any tx; 3) MARK terminal/backoff per row.
      for (const row of claimed) {
        const attempt = row.attempts + 1; // attempts was incremented at claim
        try {
          await this.dispatch(row.type, row.payload as Record<string, unknown>);
          await this.db
            .update(outboxMessages)
            .set({ status: 'SENT', processedAt: new Date() })
            .where(eq(outboxMessages.id, row.id));
        } catch (err) {
          this.logger.warn(`outbox ${row.id} (${row.type}) attempt ${attempt} failed: ${String(err)}`);
          if (attempt >= this.MAX_ATTEMPTS) {
            await this.db
              .update(outboxMessages)
              .set({ status: 'DEAD' })
              .where(eq(outboxMessages.id, row.id));
          } else {
            const backoffMs = Math.min(2 ** attempt * 1000, 5 * 60_000); // capped exponential
            await this.db
              .update(outboxMessages)
              .set({ availableAt: new Date(Date.now() + backoffMs) })
              .where(eq(outboxMessages.id, row.id));
          }
        }
      }
    } catch (err) {
      this.logger.error(`relay tick failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async dispatch(type: string, payload: Record<string, unknown>): Promise<void> {
    if (type.startsWith('email.')) {
      const p = payload as unknown as EmailPayload;
      await this.mailer.send({ to: p.to, templateId: p.templateId, vars: p.vars });
      return;
    }
    // Cross-epic events consumed later (Epic-02/05).
    this.logger.debug(`outbox event ${type} (no consumer yet): ${JSON.stringify(payload)}`);
  }
}
