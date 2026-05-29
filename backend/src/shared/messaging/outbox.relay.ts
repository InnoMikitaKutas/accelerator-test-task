import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, lte, sql } from 'drizzle-orm';
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
 * consumers land (Epic-02/05). Claims rows with FOR UPDATE SKIP LOCKED for multi-node safety.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(SYSTEM_DRIZZLE) private readonly db: DrizzleDB,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

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
      await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(outboxMessages)
          .where(and(eq(outboxMessages.status, 'PENDING'), lte(outboxMessages.availableAt, new Date())))
          .orderBy(outboxMessages.availableAt)
          .limit(20)
          .for('update', { skipLocked: true });

        for (const row of rows) {
          try {
            await this.dispatch(row.type, row.payload as Record<string, unknown>);
            await tx
              .update(outboxMessages)
              .set({ status: 'SENT', processedAt: new Date() })
              .where(eq(outboxMessages.id, row.id));
          } catch (err) {
            this.logger.warn(`outbox ${row.id} (${row.type}) failed: ${String(err)}`);
            await tx
              .update(outboxMessages)
              .set({ attempts: sql`${outboxMessages.attempts} + 1` })
              .where(eq(outboxMessages.id, row.id));
          }
        }
      });
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
