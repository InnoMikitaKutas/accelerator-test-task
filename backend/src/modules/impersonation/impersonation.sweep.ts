import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImpersonationRepository } from './impersonation.repository';

/**
 * Closes impersonation logs left open by expiry/abandonment (FR-016). The token expires on its
 * own (H1), but the audit log row would otherwise stay open forever; this periodic sweep gives it
 * a terminal endedAt/durationSec. Mirrors OutboxRelay: OnModuleInit/Destroy + setInterval, gated
 * by a config flag, single-flight via `running`.
 */
@Injectable()
export class ImpersonationSweep implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ImpersonationSweep');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repo: ImpersonationRepository,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get('IMPERSONATION_SWEEP_ENABLED', 'true') === 'false') return;
    const ms = Number(this.config.get('IMPERSONATION_SWEEP_MS', 60_000));
    this.timer = setInterval(() => void this.tick(), ms);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const ttl = Number(this.config.get('IMPERSONATION_TTL', 3600));
      const closed = await this.repo.closeExpiredOpenLogs(ttl);
      if (closed > 0) this.logger.log(`closed ${closed} expired impersonation log(s)`);
    } catch (err) {
      this.logger.error(`sweep tick failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
