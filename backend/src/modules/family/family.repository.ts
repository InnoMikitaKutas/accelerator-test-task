import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, isNull, lt, or, SQL } from 'drizzle-orm';
import { DRIZZLE, SYSTEM_DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import {
  childPurchaseApprovals,
  childTokenSettings,
  playerProfiles,
  shareLinks,
  trainerPlayerAssociations,
  trainerProfiles,
  users,
} from '@shared/database/schema';
import { TenancyService } from '@shared/tenancy/tenancy.service';
import { decodeCursor, keysetPage } from '@shared/common/pagination/cursor.util';

export type PlayerProfileRow = typeof playerProfiles.$inferSelect;
export type ApprovalRow = typeof childPurchaseApprovals.$inferSelect;

@Injectable()
export class FamilyRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(SYSTEM_DRIZZLE) private readonly system: DrizzleDB,
    private readonly tenancy: TenancyService,
  ) {}

  // ── children (player_profiles is not RLS → app pool, ownership enforced by parentUserId) ──
  getSelf(parentUserId: string): Promise<PlayerProfileRow | undefined> {
    return this.db
      .select()
      .from(playerProfiles)
      .where(and(eq(playerProfiles.userId, parentUserId), eq(playerProfiles.isSelf, true)))
      .limit(1)
      .then((r) => r[0]);
  }

  listChildren(parentUserId: string): Promise<PlayerProfileRow[]> {
    return this.db
      .select()
      .from(playerProfiles)
      .where(
        and(
          eq(playerProfiles.parentUserId, parentUserId),
          eq(playerProfiles.isChild, true),
          isNull(playerProfiles.deletedAt),
        ),
      );
  }

  findChild(parentUserId: string, childProfileId: string): Promise<PlayerProfileRow | undefined> {
    return this.db
      .select()
      .from(playerProfiles)
      .where(
        and(
          eq(playerProfiles.id, childProfileId),
          eq(playerProfiles.parentUserId, parentUserId),
          eq(playerProfiles.isChild, true),
          isNull(playerProfiles.deletedAt),
        ),
      )
      .limit(1)
      .then((r) => r[0]);
  }

  async hasDuplicate(parentUserId: string, firstName: string, lastName: string, age: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: playerProfiles.id })
      .from(playerProfiles)
      .where(
        and(
          eq(playerProfiles.parentUserId, parentUserId),
          eq(playerProfiles.isChild, true),
          isNull(playerProfiles.deletedAt),
          eq(playerProfiles.firstName, firstName),
          eq(playerProfiles.lastName, lastName),
          eq(playerProfiles.age, age),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  createChild(values: typeof playerProfiles.$inferInsert): Promise<PlayerProfileRow> {
    return this.db.insert(playerProfiles).values(values).returning().then((r) => r[0]);
  }

  updateChild(childProfileId: string, patch: Partial<PlayerProfileRow>): Promise<PlayerProfileRow> {
    return this.db
      .update(playerProfiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(playerProfiles.id, childProfileId))
      .returning()
      .then((r) => r[0]);
  }

  /** Provision a constrained child login: create User + point the profile at it. */
  async enableChildLogin(
    childProfileId: string,
    userInsert: typeof users.$inferInsert,
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values(userInsert).returning({ id: users.id });
      await tx.update(playerProfiles).set({ userId: u.id }).where(eq(playerProfiles.id, childProfileId));
      return u.id;
    });
  }

  findUserByEmail(email: string) {
    return this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).then((r) => r[0]);
  }

  getChildById(childProfileId: string): Promise<PlayerProfileRow | undefined> {
    return this.db
      .select()
      .from(playerProfiles)
      .where(and(eq(playerProfiles.id, childProfileId), isNull(playerProfiles.deletedAt)))
      .limit(1)
      .then((r) => r[0]);
  }

  getUserEmail(userId: string): Promise<string | undefined> {
    return this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((r) => r[0]?.email);
  }

  // ── token settings (not RLS → app pool) ──
  getTokenSetting(childProfileId: string): Promise<boolean> {
    return this.db
      .select()
      .from(childTokenSettings)
      .where(eq(childTokenSettings.childProfileId, childProfileId))
      .limit(1)
      .then((r) => r[0]?.allowTokenWithoutApproval ?? false);
  }

  async setTokenSetting(childProfileId: string, allow: boolean): Promise<void> {
    await this.db
      .insert(childTokenSettings)
      .values({ childProfileId, allowTokenWithoutApproval: allow })
      .onConflictDoUpdate({
        target: childTokenSettings.childProfileId,
        set: { allowTokenWithoutApproval: allow, updatedAt: new Date() },
      });
  }

  // ── associations (RLS) ──
  listActiveTrainers(childIds: string[]): Promise<{ playerProfileId: string; trainerId: string; name: string }[]> {
    if (childIds.length === 0) return Promise.resolve([]);
    return this.tenancy.runAsUser((tx) =>
      tx
        .select({
          playerProfileId: trainerPlayerAssociations.playerProfileId,
          trainerId: trainerProfiles.id,
          name: trainerProfiles.businessName,
        })
        .from(trainerPlayerAssociations)
        .innerJoin(trainerProfiles, eq(trainerProfiles.id, trainerPlayerAssociations.trainerId))
        .where(
          and(
            eq(trainerPlayerAssociations.status, 'active'),
            inArray(trainerPlayerAssociations.playerProfileId, childIds),
          ),
        ),
    );
  }

  findShareLinkByCode(code: string) {
    return this.system.select().from(shareLinks).where(eq(shareLinks.code, code)).limit(1).then((r) => r[0]);
  }

  trainerExists(trainerId: string): Promise<boolean> {
    return this.system
      .select({ id: trainerProfiles.id })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.id, trainerId))
      .limit(1)
      .then((r) => r.length > 0);
  }

  /** Run a unit of work scoped to a target trainer (for child↔trainer add/remove). */
  runScopedTo<T>(trainerId: string, fn: (tx: DrizzleDB) => Promise<T>): Promise<T> {
    return this.tenancy.runScoped(fn, trainerId);
  }

  // ── approvals (RLS: dual-axis trainer/parent) ──
  /**
   * BR-008/FR-024 — transition every PENDING approval past its 48h window to EXPIRED. Runs on the
   * SYSTEM (BYPASSRLS) pool because the sweep has no tenant session (mirrors findShareLinkByCode /
   * trainerExists). Returns the transitioned rows so the caller can notify each parent.
   */
  expirePending(): Promise<{ id: string; parentUserId: string; itemRef: string }[]> {
    return this.system
      .update(childPurchaseApprovals)
      .set({ status: 'EXPIRED', respondedAt: new Date() })
      .where(
        and(
          eq(childPurchaseApprovals.status, 'PENDING'),
          lt(childPurchaseApprovals.expiresAt, new Date()),
        ),
      )
      .returning({
        id: childPurchaseApprovals.id,
        parentUserId: childPurchaseApprovals.parentUserId,
        itemRef: childPurchaseApprovals.itemRef,
      });
  }

  createApproval(trainerId: string, values: typeof childPurchaseApprovals.$inferInsert): Promise<ApprovalRow> {
    return this.tenancy.runScoped(async (tx) => {
      const [row] = await tx.insert(childPurchaseApprovals).values(values).returning();
      return row;
    }, trainerId);
  }

  countPending(parentUserId: string): Promise<number> {
    return this.tenancy.runAsUser(async (tx) => {
      const [r] = await tx
        .select({ n: count() })
        .from(childPurchaseApprovals)
        .where(
          and(
            eq(childPurchaseApprovals.parentUserId, parentUserId),
            eq(childPurchaseApprovals.status, 'PENDING'),
            gt(childPurchaseApprovals.expiresAt, new Date()),
          ),
        );
      return Number(r?.n ?? 0);
    });
  }

  findApproval(parentUserId: string, id: string): Promise<(ApprovalRow & { childDisplayName: string }) | undefined> {
    return this.tenancy.runAsUser(async (tx) => {
      const [row] = await tx
        .select({ a: childPurchaseApprovals, fn: playerProfiles.firstName, ln: playerProfiles.lastName })
        .from(childPurchaseApprovals)
        .innerJoin(playerProfiles, eq(playerProfiles.id, childPurchaseApprovals.childProfileId))
        .where(and(eq(childPurchaseApprovals.id, id), eq(childPurchaseApprovals.parentUserId, parentUserId)))
        .limit(1);
      return row ? { ...row.a, childDisplayName: `${row.fn} ${row.ln}`.trim() } : undefined;
    });
  }

  decideApproval(id: string, status: 'APPROVED' | 'DENIED', parentNote?: string): Promise<void> {
    return this.tenancy.runAsUser(async (tx) => {
      await tx
        .update(childPurchaseApprovals)
        .set({ status, respondedAt: new Date(), parentNote })
        .where(eq(childPurchaseApprovals.id, id));
    });
  }

  listApprovals(parentUserId: string, opts: { limit: number; cursor?: string; status?: string; childProfileId?: string }) {
    return this.tenancy.runAsUser(async (tx) => {
      const conds: SQL[] = [eq(childPurchaseApprovals.parentUserId, parentUserId)];
      if (opts.status) conds.push(eq(childPurchaseApprovals.status, opts.status as ApprovalRow['status']));
      if (opts.childProfileId) conds.push(eq(childPurchaseApprovals.childProfileId, opts.childProfileId));
      if (opts.cursor) {
        const c = decodeCursor(opts.cursor);
        const cd = new Date(c.createdAt);
        conds.push(
          or(
            lt(childPurchaseApprovals.requestedAt, cd),
            and(eq(childPurchaseApprovals.requestedAt, cd), lt(childPurchaseApprovals.id, c.id)),
          ) as SQL,
        );
      }
      const rows = await tx
        .select({ a: childPurchaseApprovals, fn: playerProfiles.firstName, ln: playerProfiles.lastName })
        .from(childPurchaseApprovals)
        .innerJoin(playerProfiles, eq(playerProfiles.id, childPurchaseApprovals.childProfileId))
        .where(and(...conds))
        .orderBy(desc(childPurchaseApprovals.requestedAt), desc(childPurchaseApprovals.id))
        .limit(opts.limit + 1);
      const page = keysetPage(rows, opts.limit, (r) => ({ createdAt: r.a.requestedAt.toISOString(), id: r.a.id }));
      return {
        items: page.items.map((r) => ({ ...r.a, childDisplayName: `${r.fn} ${r.ln}`.trim() })),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
    });
  }
}
