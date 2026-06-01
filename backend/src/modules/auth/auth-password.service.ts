import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { passwordResetTokens } from '@shared/database/schema';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { PasswordService } from '@shared/auth/password.service';
import { TokenService } from '@shared/auth/token.service';
import { generateRawToken, hashToken } from '@shared/auth/token-hash';
import { OutboxService } from '@shared/messaging/outbox.service';
import { AuthRepository } from './auth.repository';
import { AuthService, IssuedTokens } from './auth.service';
import { ChangePasswordDto, ResetPasswordDto } from './dto/password.dto';

/** FR-004/005 — password reset + forced/voluntary change. */
@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly outbox: OutboxService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /** Always resolves (202). Sends a reset link only if an active account exists. */
  async forgot(email: string): Promise<void> {
    const user = await this.repo.findByEmail(email.toLowerCase());
    if (!user || user.status !== 'ACTIVE') return;
    const raw = generateRawToken();
    const ttl = Number(this.config.get('RESET_TOKEN_TTL', 3600));
    const expiresAt = new Date(Date.now() + ttl * 1000);
    await this.db.transaction(async (tx) => {
      await tx.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashToken(raw), expiresAt });
      await this.outbox.enqueue(tx, 'email.password.reset', {
        to: user.email,
        templateId: 'password.reset',
        vars: { link: `${this.config.get('APP_BASE_URL')}/reset-password?token=${raw}` },
      });
    });
  }

  async reset(dto: ResetPasswordDto): Promise<{ reset: true }> {
    const row = await this.repo.findResetByHash(hashToken(dto.token));
    if (!row) throw new AppException(AppErrorCode.TOKEN_INVALID);
    if (row.usedAt) throw new AppException(AppErrorCode.TOKEN_USED);
    if (row.expiresAt.getTime() < Date.now()) throw new AppException(AppErrorCode.TOKEN_EXPIRED);

    const hash = await this.passwords.hash(dto.newPassword);
    await this.repo.updatePassword(row.userId, hash, { clearMustChange: true });
    await this.repo.markResetUsed(row.id);
    await this.tokens.revokeAllForUser(row.userId); // invalidate all sessions
    return { reset: true };
  }

  /** Change password (rotates the session: revokes all, issues a fresh pair). */
  async change(userId: string, dto: ChangePasswordDto): Promise<IssuedTokens> {
    const user = await this.repo.findById(userId);
    if (!user) throw new AppException(AppErrorCode.UNAUTHENTICATED);

    if (!user.mustChangePassword) {
      if (!dto.currentPassword) {
        throw new AppException(AppErrorCode.VALIDATION_ERROR, {
          details: [{ field: 'currentPassword', message: 'Current password is required' }],
        });
      }
      const ok = await this.passwords.verify(user.passwordHash, dto.currentPassword);
      if (!ok) throw new AppException(AppErrorCode.INVALID_CREDENTIALS);
    }

    const hash = await this.passwords.hash(dto.newPassword);
    await this.repo.updatePassword(userId, hash, { clearMustChange: true });
    await this.tokens.revokeAllForUser(userId);

    const fresh = await this.repo.findById(userId);
    return this.tokens.issueSession(this.auth.claimsFrom(fresh!));
  }
}
