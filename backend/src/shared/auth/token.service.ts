import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '@shared/redis/redis.constants';
import type { Role } from '@shared/database/schema';

export interface AccessClaims {
  sub: string;
  role: Role;
  email: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  isMinor: boolean;
  managedByParentUserId?: string | null;
  /** Refresh-token family — also embedded in the access token so logout can revoke it. */
  family: string;
  // Impersonation (FR-015).
  impersonatorAdminId?: string;
  impersonationExp?: number;
}

interface RefreshClaims {
  sub: string;
  jti: string;
  family: string;
}

const GRACE_SEC = 15; // R5: tolerate the immediately-previous jti briefly (multi-tab refresh race).

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private get refreshTtl(): number {
    return Number(this.config.get('REFRESH_TOKEN_TTL', 604800));
  }

  /** Fresh login → new family + token pair. Tracks the family under the user for bulk revoke. */
  async issueSession(
    claims: Omit<AccessClaims, 'family'>,
  ): Promise<{ accessToken: string; refreshToken: string; family: string }> {
    const family = randomUUID();
    const jti = randomUUID();
    await this.redis.set(`rt:${family}`, jti, 'EX', this.refreshTtl);
    await this.redis.sadd(`rtu:${claims.sub}`, family);
    await this.redis.expire(`rtu:${claims.sub}`, this.refreshTtl);
    const accessToken = await this.signAccess({ ...claims, family });
    const refreshToken = await this.signRefresh(claims.sub, jti, family);
    return { accessToken, refreshToken, family };
  }

  signAccess(claims: AccessClaims, expiresInSec?: number): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: expiresInSec ?? Number(this.config.get('ACCESS_TOKEN_TTL', 900)),
    });
  }

  verifyAccess(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAsync<AccessClaims>(token, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }

  private signRefresh(sub: string, jti: string, family: string): Promise<string> {
    return this.jwt.signAsync(
      { sub, jti, family },
      { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl },
    );
  }

  /**
   * Validate a refresh token: verify signature, detect reuse, allow a brief grace for the
   * immediately-previous jti (multi-tab races). Returns {sub, family} or null (caller → 401).
   * On true reuse the whole family is revoked.
   */
  async rotate(refreshToken: string): Promise<{ sub: string; family: string } | null> {
    let payload: RefreshClaims;
    try {
      payload = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      return null;
    }
    const cur = await this.redis.get(`rt:${payload.family}`);
    if (cur === null) return null; // family revoked or expired
    if (cur === payload.jti) return { sub: payload.sub, family: payload.family };
    const grace = await this.redis.get(`rt:grace:${payload.family}`);
    if (grace !== null && grace === payload.jti) return { sub: payload.sub, family: payload.family };
    // Neither current nor graced-previous → reuse. Revoke the family.
    await this.redis.del(`rt:${payload.family}`);
    await this.redis.del(`rt:grace:${payload.family}`);
    return null;
  }

  /** After a successful rotate(), mint the next pair on the same family. */
  async rotateIssue(
    family: string,
    access: Omit<AccessClaims, 'family'>,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const oldCur = await this.redis.get(`rt:${family}`);
    const newJti = randomUUID();
    await this.redis.set(`rt:${family}`, newJti, 'EX', this.refreshTtl);
    if (oldCur) await this.redis.set(`rt:grace:${family}`, oldCur, 'EX', GRACE_SEC);
    const accessToken = await this.signAccess({ ...access, family });
    const refreshToken = await this.signRefresh(access.sub, newJti, family);
    return { accessToken, refreshToken };
  }

  async revokeFamily(family: string): Promise<void> {
    await this.redis.del(`rt:${family}`);
    await this.redis.del(`rt:grace:${family}`);
  }

  /** Revoke every session for a user (password reset/change, GDPR delete). */
  async revokeAllForUser(sub: string): Promise<void> {
    const families = await this.redis.smembers(`rtu:${sub}`);
    for (const f of families) {
      await this.redis.del(`rt:${f}`);
      await this.redis.del(`rt:grace:${f}`);
    }
    await this.redis.del(`rtu:${sub}`);
  }

  /** Impersonation token for the target user, carrying impersonatorAdminId + a 1h hard cap. */
  issueImpersonation(target: Omit<AccessClaims, 'family'>, adminId: string): Promise<string> {
    const ttl = Number(this.config.get('IMPERSONATION_TTL', 3600));
    // Sign with the impersonation TTL so the JWT `exp` matches the cookie maxAge and the
    // impersonationExp claim — otherwise the token dies at the 15min access TTL (H1).
    return this.signAccess(
      {
        ...target,
        family: `imp:${adminId}`,
        impersonatorAdminId: adminId,
        impersonationExp: Math.floor(Date.now() / 1000) + ttl,
      },
      ttl,
    );
  }
}
