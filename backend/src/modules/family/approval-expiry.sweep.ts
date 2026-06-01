import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { OutboxService } from '@shared/messaging/outbox.service';
import { FamilyRepository } from './family.repository';

/**
 * BR-008/FR-024 — persists the 48h purchase-approval auto-deny. Read-time expiry (toResponse)
 * makes the UI correct, but PENDING rows would never reach a terminal state and the parent would
 * never be told. This periodic sweep flips them to EXPIRED and enqueues a notification per row.
 * Mirrors OutboxRelay: OnModuleInit/Destroy + setInterval, config-gated, single-flight.
 */
@Injectable()
export class ApprovalExpirySweep implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ApprovalExpirySweep');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repo: FamilyRepository,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  onModuleInit(): void {
    if (this.config.get('APPROVAL_SWEEP_ENABLED', 'true') === 'false') return;
    const ms = Number(this.config.get('APPROVAL_SWEEP_MS', 60_000));
    this.timer = setInterval(() => void this.tick(), ms);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.repo.expirePending();
      const base = this.config.get('APP_BASE_URL', 'http://localhost:5173');
      for (const row of expired) {
        const email = await this.repo.getUserEmail(row.parentUserId);
        if (!email) continue;
        await this.db.transaction((tx) =>
          this.outbox.enqueue(tx, 'email.child.approval-expired', {
            to: email,
            templateId: 'child.approval-expired',
            vars: { item: row.itemRef, link: `${base}/family` },
          }),
        );
      }
      if (expired.length) this.logger.log(`expired ${expired.length} approval(s)`);
    } catch (err) {
      this.logger.error(`approval sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
