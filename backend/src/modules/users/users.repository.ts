import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, inArray, lt, or, SQL } from 'drizzle-orm';
import { SYSTEM_DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import {
  coachProfiles,
  outboxMessages,
  passwordResetTokens,
  playerProfiles,
  trainerCoachAssociations,
  trainerPlayerAssociations,
  trainerProfiles,
  userDeletionLogs,
  users,
} from '@shared/database/schema';
import { decodeCursor, keysetPage } from '@shared/common/pagination/cursor.util';
import { UserListQueryDto } from './dto/user-query.dto';

export type UserRow = typeof users.$inferSelect;

export interface CreateTrainerParams {
  user: typeof users.$inferInsert;
  businessName: string;
  businessAddress?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  outbox: { type: string; payload: Record<string, unknown> };
}

/**
 * Super-Admin data access. Uses the SYSTEM (BYPASSRLS) pool because admin operations span all
 * tenants — the trainer-org filter joins RLS-protected association tables (architect review R1).
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(SYSTEM_DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  async list(q: UserListQueryDto) {
    const limit = q.limit ?? 25;
    const dir = q.sort === 'createdAt:asc' ? 'asc' : 'desc';
    const conds: SQL[] = [];

    if (q.search) {
      const s = `%${q.search}%`;
      conds.push(or(ilike(users.firstName, s), ilike(users.lastName, s), ilike(users.email, s)) as SQL);
    }
    if (q.role) conds.push(eq(users.role, q.role));
    if (q.status) conds.push(eq(users.status, q.status));
    if (q.trainerId) {
      const ids = await this.associatedUserIds(q.trainerId);
      if (ids.length === 0) return { items: [], nextCursor: null, hasMore: false };
      conds.push(inArray(users.id, ids));
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      const cd = new Date(c.createdAt);
      conds.push(
        (dir === 'desc'
          ? or(lt(users.createdAt, cd), and(eq(users.createdAt, cd), lt(users.id, c.id)))
          : or(gt(users.createdAt, cd), and(eq(users.createdAt, cd), gt(users.id, c.id)))) as SQL,
      );
    }

    const where = conds.length ? and(...conds) : undefined;
    const order = dir === 'desc' ? [desc(users.createdAt), desc(users.id)] : [asc(users.createdAt), asc(users.id)];
    const rows = await this.db.select().from(users).where(where).orderBy(...order).limit(limit + 1);
    return keysetPage(rows, limit, (r) => ({ createdAt: r.createdAt.toISOString(), id: r.id }));
  }

  private async associatedUserIds(trainerId: string): Promise<string[]> {
    const players = await this.db
      .select({ uid: playerProfiles.userId })
      .from(trainerPlayerAssociations)
      .innerJoin(playerProfiles, eq(playerProfiles.id, trainerPlayerAssociations.playerProfileId))
      .where(and(eq(trainerPlayerAssociations.trainerId, trainerId), eq(trainerPlayerAssociations.status, 'active')));
    const coaches = await this.db
      .select({ uid: coachProfiles.userId })
      .from(trainerCoachAssociations)
      .innerJoin(coachProfiles, eq(coachProfiles.id, trainerCoachAssociations.coachProfileId))
      .where(and(eq(trainerCoachAssociations.trainerId, trainerId), eq(trainerCoachAssociations.status, 'active')));
    return [...new Set([...players.map((p) => p.uid), ...coaches.map((c) => c.uid)])];
  }

  async update(id: string, patch: Partial<Pick<UserRow, 'firstName' | 'lastName' | 'phone'>>): Promise<UserRow | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row;
  }

  async setStatus(id: string, status: UserRow['status']): Promise<UserRow | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row;
  }

  /** Bare user insert (camp-import stub; profile/association finalized by Epic-08). */
  async createUser(insert: typeof users.$inferInsert): Promise<UserRow> {
    const [row] = await this.db.insert(users).values(insert).returning();
    return row;
  }

  /** 1-tx: create User(role=TRAINER) + TrainerProfile + (invite reset token) + invite email outbox. */
  async createTrainer(params: CreateTrainerParams): Promise<UserRow> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values(params.user).returning();
      await tx.insert(trainerProfiles).values({
        userId: user.id,
        businessName: params.businessName,
        businessAddress: params.businessAddress,
      });
      if (params.resetTokenHash && params.resetTokenExpiresAt) {
        await tx.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: params.resetTokenHash,
          expiresAt: params.resetTokenExpiresAt,
        });
      }
      await tx.insert(outboxMessages).values({ type: params.outbox.type, payload: params.outbox.payload });
      return user;
    });
  }

  /** 1-tx: anonymize PII in place + write UserDeletionLog (FR-014/BR-010). Returns the log id. */
  async anonymize(
    userId: string,
    params: { deletedBy: string; reason: string; originalEmail: string },
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const anonEmail = `deleted-user-${userId}@anon.invalid`;
      await tx
        .update(users)
        .set({
          email: anonEmail,
          firstName: 'Deleted',
          lastName: 'User',
          phone: null,
          photoUrl: null,
          thumbnailUrl: null,
          status: 'DELETED',
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      const [log] = await tx
        .insert(userDeletionLogs)
        .values({
          originalUserId: userId,
          originalEmail: params.originalEmail,
          deletedBy: params.deletedBy,
          reason: params.reason,
        })
        .returning({ id: userDeletionLogs.id });
      return log.id;
    });
  }
}
