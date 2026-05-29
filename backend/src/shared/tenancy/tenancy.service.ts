import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { CTX_KEYS, SessionPrincipal } from '@shared/context/request-context';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';

/**
 * Runs units of work with the per-transaction RLS GUCs set (architect review R1/R2):
 *   app.current_trainer_id — Zone-3 tenant scoping
 *   app.current_user_id    — Zone-1 account/parent reads + TenantGuard pre-resolution
 * Uses set_config(..., is_local=true) so the GUCs reset at transaction end (pool-safe).
 */
@Injectable()
export class TenancyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cls: ClsService,
  ) {}

  currentTrainerId(): string {
    const id = this.cls.get<string>(CTX_KEYS.activeTrainerId);
    if (!id) throw new AppException(AppErrorCode.TENANT_FORBIDDEN, { message: 'No active trainer context.' });
    return id;
  }

  private currentUserId(): string | undefined {
    return this.cls.get<SessionPrincipal>(CTX_KEYS.user)?.id;
  }

  /** Zone-3: tenant-scoped transaction (both GUCs set). */
  async runScoped<T>(
    fn: (tx: DrizzleDB) => Promise<T>,
    trainerId: string = this.currentTrainerId(),
  ): Promise<T> {
    const userId = this.currentUserId();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_trainer_id', ${trainerId}, true)`);
      if (userId) await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
      return fn(tx as unknown as DrizzleDB);
    });
  }

  /** Zone-1: account/parent-scoped transaction (only the user GUC). */
  async runAsUser<T>(fn: (tx: DrizzleDB) => Promise<T>): Promise<T> {
    const userId = this.currentUserId();
    return this.db.transaction(async (tx) => {
      if (userId) await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
      return fn(tx as unknown as DrizzleDB);
    });
  }
}
