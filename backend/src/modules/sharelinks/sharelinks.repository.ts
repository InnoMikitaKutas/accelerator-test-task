import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, SQL } from 'drizzle-orm';
import { shareLinks } from '@shared/database/schema';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { OutboxService } from '@shared/messaging/outbox.service';
import { decodeCursor, keysetPage } from '@shared/common/pagination/cursor.util';

export type ShareLinkRow = typeof shareLinks.$inferSelect;

/** Trainer-scoped ShareLink data access (app pool + RLS via runScoped). */
@Injectable()
export class ShareLinksRepository {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly outbox: OutboxService,
  ) {}

  /** Creates a link, optionally enqueuing an email in the same tx (coach invite). */
  create(
    values: typeof shareLinks.$inferInsert,
    outbox?: { type: string; payload: Record<string, unknown> },
  ): Promise<ShareLinkRow> {
    return this.tenancy.runScoped(async (tx) => {
      const [row] = await tx.insert(shareLinks).values(values).returning();
      if (outbox) await this.outbox.enqueue(tx, outbox.type, outbox.payload);
      return row;
    });
  }

  list(opts: { limit: number; cursor?: string; type?: string; status?: string }) {
    return this.tenancy.runScoped(async (tx) => {
      const conds: SQL[] = [];
      if (opts.type) conds.push(eq(shareLinks.type, opts.type as ShareLinkRow['type']));
      if (opts.status) conds.push(eq(shareLinks.status, opts.status as ShareLinkRow['status']));
      if (opts.cursor) {
        const c = decodeCursor(opts.cursor);
        const cd = new Date(c.createdAt);
        conds.push(
          or(lt(shareLinks.createdAt, cd), and(eq(shareLinks.createdAt, cd), lt(shareLinks.id, c.id))) as SQL,
        );
      }
      const where = conds.length ? and(...conds) : undefined;
      const rows = await tx
        .select()
        .from(shareLinks)
        .where(where)
        .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id))
        .limit(opts.limit + 1);
      return keysetPage(rows, opts.limit, (r) => ({ createdAt: r.createdAt.toISOString(), id: r.id }));
    });
  }

  findByIdScoped(id: string): Promise<ShareLinkRow | undefined> {
    return this.tenancy.runScoped(async (tx) => {
      const [row] = await tx.select().from(shareLinks).where(eq(shareLinks.id, id)).limit(1);
      return row;
    });
  }

  deactivate(id: string): Promise<ShareLinkRow | undefined> {
    return this.tenancy.runScoped(async (tx) => {
      const [row] = await tx
        .update(shareLinks)
        .set({ active: false, status: 'REVOKED', updatedAt: new Date() })
        .where(eq(shareLinks.id, id))
        .returning();
      return row;
    });
  }
}
