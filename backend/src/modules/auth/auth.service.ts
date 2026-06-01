import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { verificationTokens } from '@shared/database/schema';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { PasswordService } from '@shared/auth/password.service';
import { AccessClaims, TokenService } from '@shared/auth/token.service';
import { generateRawToken, hashToken } from '@shared/auth/token-hash';
import { OutboxService } from '@shared/messaging/outbox.service';
import { AuthRepository, UserRow } from './auth.repository';
import { LoginDto } from './dto/login.dto';
import { SessionUserDto } from './dto/session-user.dto';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /** FR-001/003/006/013 — generic INVALID_CREDENTIALS; verification + status branches. */
  async login(dto: LoginDto): Promise<{ user: SessionUserDto; tokens: IssuedTokens }> {
    const email = dto.email.toLowerCase();
    const user = await this.repo.findByEmail(email);
    if (!user) throw new AppException(AppErrorCode.INVALID_CREDENTIALS);

    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) throw new AppException(AppErrorCode.INVALID_CREDENTIALS);

    // D-1 (accepted trade-off): credentials are verified before the status/verified branches, so
    // ACCOUNT_INACTIVE / EMAIL_NOT_VERIFIED imply valid credentials. Intentional for UX (clear
    // remediation messaging); see specs "Accepted trade-offs". Throttling (5/min) bounds probing.
    if (user.status !== 'ACTIVE') throw new AppException(AppErrorCode.ACCOUNT_INACTIVE);
    if (!user.emailVerified) {
      throw new AppException(AppErrorCode.EMAIL_NOT_VERIFIED, { extra: { canResend: true } });
    }

    const tokens = await this.tokens.issueSession(this.claimsFrom(user));
    await this.repo.setLastLogin(user.id);
    return { user: this.buildSessionUser(user), tokens };
  }

  /** FR-003 — consume an email-verification token. */
  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const row = await this.repo.findVerificationByHash(hashToken(rawToken));
    if (!row) throw new AppException(AppErrorCode.TOKEN_INVALID);
    if (row.usedAt) throw new AppException(AppErrorCode.TOKEN_USED);
    if (row.expiresAt.getTime() < Date.now()) throw new AppException(AppErrorCode.TOKEN_EXPIRED);
    await this.repo.consumeVerification(row.id, row.userId);
    return { verified: true };
  }

  /** FR-003 — always 202; sends only if an unverified account exists (no enumeration). */
  async resendVerification(email: string): Promise<void> {
    const user = await this.repo.findUnverifiedByEmail(email.toLowerCase());
    if (!user) return;
    await this.issueVerification(user);
  }

  /** Creates a verification token + enqueues the email atomically. Reused by registration (Module D). */
  async issueVerification(user: Pick<UserRow, 'id' | 'email' | 'firstName'>): Promise<void> {
    const raw = generateRawToken();
    const ttl = Number(this.config.get('VERIFICATION_TOKEN_TTL', 86400));
    const expiresAt = new Date(Date.now() + ttl * 1000);
    await this.db.transaction(async (tx) => {
      // token + outbox enqueue committed atomically
      await tx
        .insert(verificationTokens)
        .values({ userId: user.id, tokenHash: hashToken(raw), expiresAt });
      await this.outbox.enqueue(tx, 'email.verification', {
        to: user.email,
        templateId: 'email.verification',
        vars: { name: user.firstName, link: this.link('verify-email', raw) },
      });
    });
  }

  /** FR-006 — rotate the session; null → caller returns 401. */
  async refresh(refreshToken: string): Promise<IssuedTokens | null> {
    const rotated = await this.tokens.rotate(refreshToken);
    if (!rotated) return null;
    const user = await this.repo.findById(rotated.sub);
    if (!user || user.status !== 'ACTIVE') return null;
    return this.tokens.rotateIssue(rotated.family, this.claimsFrom(user));
  }

  async logout(family: string | undefined): Promise<void> {
    if (family) await this.tokens.revokeFamily(family);
  }

  /** FR-006/008 — current principal (+ impersonatedBy). */
  async me(userId: string, impersonatorAdminId?: string): Promise<SessionUserDto> {
    const user = await this.repo.findById(userId);
    if (!user) throw new AppException(AppErrorCode.UNAUTHENTICATED);
    return { ...this.buildSessionUser(user), impersonatedBy: impersonatorAdminId ?? null };
  }

  claimsFrom(user: UserRow): Omit<AccessClaims, 'family'> {
    return {
      sub: user.id,
      role: user.role,
      email: user.email,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
      isMinor: user.isMinor,
      managedByParentUserId: user.managedByParentUserId,
    };
  }

  buildSessionUser(user: UserRow): SessionUserDto {
    const defaultContext =
      user.role === 'PLAYER' && user.defaultSubjectProfileId && user.defaultTrainerId
        ? { subjectProfileId: user.defaultSubjectProfileId, trainerId: user.defaultTrainerId }
        : null;
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
      defaultContext,
    };
  }

  private link(path: string, token: string): string {
    return `${this.config.get('APP_BASE_URL', 'http://localhost:5173')}/${path}?token=${token}`;
  }
}
