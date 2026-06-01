import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { passwordResetTokens, users, verificationTokens } from '@shared/database/schema';

export type UserRow = typeof users.$inferSelect;

/** Data access for users + auth tokens (NOT tenant-owned → direct DRIZZLE, no scoping). */
@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  async findById(id: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async setLastLogin(id: string): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    opts?: { clearMustChange?: boolean },
  ): Promise<void> {
    await this.db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
        ...(opts?.clearMustChange ? { mustChangePassword: false } : {}),
      })
      .where(eq(users.id, userId));
  }

  // ── verification tokens ────────────────────────────────────────────────────
  async findUnverifiedByEmail(email: string): Promise<UserRow | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.emailVerified, false)))
      .limit(1);
    return row;
  }

  async createVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(verificationTokens).values({ userId, tokenHash, expiresAt });
  }

  async findVerificationByHash(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  async consumeVerification(tokenId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
      await tx
        .update(verificationTokens)
        .set({ usedAt: new Date() })
        .where(eq(verificationTokens.id, tokenId));
    });
  }

  // ── reset tokens ───────────────────────────────────────────────────────────
  async createResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
  }

  async findResetByHash(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .limit(1);
    return row;
  }

  async markResetUsed(tokenId: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, tokenId));
  }
}
