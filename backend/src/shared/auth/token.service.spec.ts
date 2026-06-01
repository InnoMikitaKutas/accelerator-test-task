import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService, AccessClaims } from './token.service';

/** Minimal in-memory Redis fake covering the methods TokenService uses. */
class FakeRedis {
  store = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  async get(k: string) {
    return this.store.has(k) ? (this.store.get(k) as string) : null;
  }
  async set(k: string, v: string) {
    this.store.set(k, v);
    return 'OK';
  }
  async del(k: string) {
    this.sets.delete(k);
    return this.store.delete(k) ? 1 : 0;
  }
  async sadd(k: string, m: string) {
    const s = this.sets.get(k) ?? new Set<string>();
    s.add(m);
    this.sets.set(k, s);
    return 1;
  }
  async smembers(k: string) {
    return [...(this.sets.get(k) ?? [])];
  }
  async expire() {
    return 1;
  }
}

const baseClaims: Omit<AccessClaims, 'family'> = {
  sub: 'user-1',
  role: 'PLAYER',
  email: 'a@b.com',
  emailVerified: true,
  mustChangePassword: false,
  isMinor: false,
};

function makeService(redis: FakeRedis) {
  const config = {
    getOrThrow: (k: string) =>
      ({ JWT_ACCESS_SECRET: 'access-secret', JWT_REFRESH_SECRET: 'refresh-secret' })[k],
    get: (k: string, d?: unknown) =>
      ({ ACCESS_TOKEN_TTL: 900, REFRESH_TOKEN_TTL: 604800, IMPERSONATION_TTL: 3600 })[k] ?? d,
  } as unknown as ConfigService;
  return new TokenService(new JwtService({}), config, redis as never);
}

describe('TokenService', () => {
  it('issues a verifiable access token + stores the refresh family', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);
    const { accessToken, family } = await svc.issueSession(baseClaims);
    const claims = await svc.verifyAccess(accessToken);
    expect(claims.sub).toBe('user-1');
    expect(claims.family).toBe(family);
    expect(redis.store.get(`rt:${family}`)).toBeDefined();
  });

  it('rotates a valid refresh and advances the stored jti', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);
    const { refreshToken, family } = await svc.issueSession(baseClaims);
    const before = redis.store.get(`rt:${family}`);
    const ok = await svc.rotate(refreshToken);
    expect(ok).toEqual({ sub: 'user-1', family });
    const issued = await svc.rotateIssue(family, baseClaims);
    expect(redis.store.get(`rt:${family}`)).not.toBe(before);
    // the freshly issued refresh validates
    expect(await svc.rotate(issued.refreshToken)).toEqual({ sub: 'user-1', family });
  });

  it('detects reuse of an already-rotated refresh → revokes the family', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);
    const { refreshToken, family } = await svc.issueSession(baseClaims);
    await svc.rotate(refreshToken);
    await svc.rotateIssue(family, baseClaims); // advance past grace target
    // wipe grace to simulate an old, non-graced token being replayed
    redis.store.delete(`rt:grace:${family}`);
    const replay = await svc.rotate(refreshToken);
    expect(replay).toBeNull();
    expect(redis.store.has(`rt:${family}`)).toBe(false); // family revoked
  });

  it('tolerates the immediately-previous jti within the grace window (multi-tab)', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);
    const { refreshToken, family } = await svc.issueSession(baseClaims);
    await svc.rotateIssue(family, baseClaims); // sets rt:grace:<family> = old jti
    const raced = await svc.rotate(refreshToken); // old token, but graced
    expect(raced).toEqual({ sub: 'user-1', family });
  });

  it('revokeAllForUser kills every tracked family', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);
    const a = await svc.issueSession(baseClaims);
    const b = await svc.issueSession(baseClaims);
    await svc.revokeAllForUser('user-1');
    expect(await svc.rotate(a.refreshToken)).toBeNull();
    expect(await svc.rotate(b.refreshToken)).toBeNull();
  });

  it('issues an impersonation token carrying impersonatorAdminId + expiry', async () => {
    const svc = makeService(new FakeRedis());
    const token = await svc.issueImpersonation(baseClaims, 'admin-9');
    const claims = await svc.verifyAccess(token);
    expect(claims.impersonatorAdminId).toBe('admin-9');
    expect(claims.impersonationExp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('issueImpersonation signs with IMPERSONATION_TTL, not the 15min access TTL', async () => {
    const svc = makeService(new FakeRedis());
    const token = await svc.issueImpersonation(baseClaims, 'admin-1');
    const decoded = new JwtService({}).decode(token) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(3600); // would be 900 (ACCESS_TOKEN_TTL) before the fix
  });
});
