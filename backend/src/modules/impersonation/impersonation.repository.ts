import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lt, lte, or, sql, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { SYSTEM_DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { impersonationLogs, users } from '@shared/database/schema';
import { decodeCursor, keysetPage } from '@shared/common/pagination/cursor.util';
import { ImpersonationHistoryQueryDto, ImpersonationLogDto } from './dto/impersonation.dto';

export type UserRow = typeof users.$inferSelect;
export type ImpersonationLogRow = typeof impersonationLogs.$inferSelect;

/** Super-Admin impersonation data access (system pool — spans tenants). */
@Injectable()
export class ImpersonationRepository {
  constructor(@Inject(SYSTEM_DRIZZLE) private readonly db: DrizzleDB) {}

  async findUserById(id: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async startLog(adminId: string, targetUserId: string, reason?: string): Promise<string> {
    const [row] = await this.db
      .insert(impersonationLogs)
      .values({ adminId, targetUserId, reason })
      .returning({ id: impersonationLogs.id });
    return row.id;
  }

  /** Closes the latest open log for an admin; returns it (or null if none open). */
  async closeOpenLog(adminId: string): Promise<ImpersonationLogRow | null> {
    const [open] = await this.db
      .select()
      .from(impersonationLogs)
      .where(and(eq(impersonationLogs.adminId, adminId), isNull(impersonationLogs.endedAt)))
      .orderBy(desc(impersonationLogs.startedAt))
      .limit(1);
    if (!open) return null;
    const endedAt = new Date();
    const durationSec = Math.round((endedAt.getTime() - open.startedAt.getTime()) / 1000);
    await this.db
      .update(impersonationLogs)
      .set({ endedAt, durationSec })
      .where(eq(impersonationLogs.id, open.id));
    return open;
  }

  /** Close every still-open log older than `ttlSec` (expired/abandoned). Returns rows closed. */
  async closeExpiredOpenLogs(ttlSec: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlSec * 1000);
    const result = await this.db
      .update(impersonationLogs)
      .set({
        endedAt: sql`now()`,
        durationSec: sql`extract(epoch from (now() - ${impersonationLogs.startedAt}))::int`,
      })
      .where(and(isNull(impersonationLogs.endedAt), lt(impersonationLogs.startedAt, cutoff)))
      .returning({ id: impersonationLogs.id });
    return result.length;
  }

  async history(q: ImpersonationHistoryQueryDto) {
    const adminU = alias(users, 'admin_u');
    const targetU = alias(users, 'target_u');
    const limit = q.limit ?? 25;
    const conds: SQL[] = [];
    if (q.adminId) conds.push(eq(impersonationLogs.adminId, q.adminId));
    if (q.targetUserId) conds.push(eq(impersonationLogs.targetUserId, q.targetUserId));
    if (q.from) conds.push(gte(impersonationLogs.startedAt, new Date(q.from)));
    if (q.to) conds.push(lte(impersonationLogs.startedAt, new Date(q.to)));
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      const cd = new Date(c.createdAt);
      conds.push(
        or(
          lt(impersonationLogs.startedAt, cd),
          and(eq(impersonationLogs.startedAt, cd), lt(impersonationLogs.id, c.id)),
        ) as SQL,
      );
    }
    const rows = await this.db
      .select({
        id: impersonationLogs.id,
        adminId: impersonationLogs.adminId,
        adminEmail: adminU.email,
        targetUserId: impersonationLogs.targetUserId,
        targetEmail: targetU.email,
        startedAt: impersonationLogs.startedAt,
        endedAt: impersonationLogs.endedAt,
        durationSec: impersonationLogs.durationSec,
      })
      .from(impersonationLogs)
      .innerJoin(adminU, eq(adminU.id, impersonationLogs.adminId))
      .innerJoin(targetU, eq(targetU.id, impersonationLogs.targetUserId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(impersonationLogs.startedAt), desc(impersonationLogs.id))
      .limit(limit + 1);

    const page = keysetPage(rows, limit, (r) => ({ createdAt: r.startedAt.toISOString(), id: r.id }));
    const items: ImpersonationLogDto[] = page.items.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      adminEmail: r.adminEmail,
      targetUserId: r.targetUserId,
      targetEmail: r.targetEmail,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
      durationSec: r.durationSec,
    }));
    return { items, nextCursor: page.nextCursor, hasMore: page.hasMore };
  }
}
