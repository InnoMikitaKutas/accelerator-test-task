# Epic-01 Backend — Code-Review Remediation Implementation Plan

**Task:** TASK-002

> **For Claude:** Use `using-git-worktrees` to create an isolated workspace, then implement with the `coder` skill. Each task below is independently committable; work top-to-bottom (Critical → High → Medium → Low). Use `test-generator` for extra coverage and `verify` before opening a PR.

**Goal:** Close the 18 findings from `tasks/TASK-001/code-reviewer-backend-review.md` (1 Critical, 2 High, 7 Medium, 9 Low) on the Epic-01 backend without regressing the verified-correct multi-tenancy / token / RLS foundations.

**Architecture:** Layered NestJS (Controller → Service → Repository) with Drizzle ORM, dual-axis Postgres RLS, a transactional outbox, and Redis-backed refresh-token families. Fixes stay inside the existing layering. New background jobs follow the **existing `OutboxRelay` pattern** (`OnModuleInit`/`OnModuleDestroy` + `setInterval`, gated by a config flag, on the `SYSTEM_DRIZZLE` BYPASSRLS pool) — **do not** add `@nestjs/schedule`.

**Tech Stack:** NestJS 11, TypeScript, Drizzle ORM + drizzle-kit, PostgreSQL (RLS), Redis (ioredis), Jest + ts-jest (unit, direct instantiation with hand-built mocks), Supertest (e2e), sharp, argon2, `isomorphic-dompurify` (new — SVG sanitization).

---

## Decisions baked into this plan (confirmed with the requester)

- **C1 (SVG XSS):** *Sanitize SVG + isolate origin* — keep SVG logos but DOMPurify-sanitize at upload, validate by magic bytes, and define a safe-serving contract (`Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`, cookieless origin in prod). **Not** "drop SVG."
- **L3 / L7 (login/​join behavior):** *Document as intended* — no behavioral code change; fix the stale comments and add a short spec note explaining the trade-off.

## Pre-flight environment note (read before C1's serving sub-task)

`grep` confirms **nothing currently serves `STORAGE_PUBLIC_BASE_URL` / `/static`** (no `useStaticAssets`, no `ServeStaticModule`). The stored-XSS is therefore **latent** — `LocalStorageAdapter` writes the bytes and returns a URL, but no route serves them yet. The durable fix is **sanitize-at-upload** (the stored bytes become safe); the serving headers are a defense-in-depth contract for when static serving / the S3 adapter lands. Keep that ordering in mind: sanitization is the real fix; do not gate C1 on standing up a static server.

---

## Toolchain baseline (must stay green after every task)

```bash
npm run build      # tsc — exit 0
npm run lint       # eslint --max-warnings 0 — exit 0
npm test           # jest unit — currently 19 suites / 89 tests, all pass
```

`npm run test:e2e` needs Postgres (two roles: `app` + `system`) and Redis; run it where that infra is available (it is **not** required to pass each unit task, but the C1, H1, H2, M5 e2e additions below must pass before the PR merges).

---

## Task summary & ordering

| # | Findings | Title | Risk if skipped |
|---|----------|-------|-----------------|
| 1 | C1, L8 | SVG sanitization + magic-byte validation + safe-serving contract | Account takeover via stored XSS |
| 2 | H1 | Impersonation token TTL fix + expiry sweep job | 1h window dead; logs never close |
| 3 | H2 | Deactivation revokes active sessions | Disabled user keeps ~15min access |
| 4 | M1 | `/join` existing-user branch honors link type + single-use | Wrong association; single-use leak |
| 5 | M2, L5 | Trainer override requires active association + reason validation | Cross-tenant write |
| 6 | M3 | 48h approval auto-deny sweep (terminal state + notification) | Stuck `PENDING`; no notify |
| 7 | M4 | Multer `fileSize` limit (pre-buffering) | Memory-pressure DoS |
| 8 | M5 | CORS before CSRF + non-permissive origin | Misconfig / masked CORS errors |
| 9 | M6 | Outbox relay reliability (claim→commit→send→mark, DEAD, backoff, idempotency) | HOL-block; double-send; infinite retry |
| 10 | M7 | Env/secret validation hardening | Weak secrets + insecure cookies pass at boot |
| 11 | L1, L2 | DB hardening migration (keyset indexes + child-age CHECK) | Slow pages at scale; bad-age rows |
| 12 | L4 | Availability excludes soft-deleted players | Soft-deleted players readable/writable |
| 13 | L6 | Cursor `createdAt` value validation | Silently wrong/empty page |
| 14 | L3, L7, L9 | Documentation: stale comments + intended-behavior spec notes | Misleading docs |

---

## Task 1: SVG sanitization + magic-byte validation + safe-serving contract (C1, L8)

**Findings:** C1 (Critical — stored XSS via unsanitized SVG logo), L8 (local adapter drops `contentType`).
**Requirement:** FR-037, §13 security.

**Files:**
- Modify: `backend/package.json` (add `isomorphic-dompurify` dependency)
- Modify: `backend/src/shared/storage/file-validation.ts` (magic-byte validation)
- Modify: `backend/src/shared/storage/image.service.ts:30-38` (sanitize SVG instead of pass-through)
- Modify: `backend/src/shared/storage/local-storage.adapter.ts:18-24` (honor `contentType`; sidecar metadata — fixes L8)
- Create: `backend/src/shared/storage/svg-sanitizer.ts`
- Create: `backend/src/shared/storage/magic-bytes.ts`
- Test: `backend/src/shared/storage/svg-sanitizer.spec.ts`
- Test: `backend/src/shared/storage/magic-bytes.spec.ts`
- Modify (test): `backend/src/shared/storage/image.service.spec.ts`
- Modify (docs): `backend/src/shared/storage/local-storage.adapter.ts` header comment + `specs/architect-architecture.md` (serving contract note)

### Step 1: Install the sanitizer dependency

Run:
```bash
cd backend && npm install isomorphic-dompurify@^2
```
Expected: adds `isomorphic-dompurify` to `dependencies` (it bundles a JSDOM window, so no server DOM wiring is needed). Verify `npm run build` still exits 0.

### Step 2: Write the failing magic-bytes test

Create `backend/src/shared/storage/magic-bytes.spec.ts`:

```typescript
import { sniffImageType } from './magic-bytes';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
const svgNoProlog = Buffer.from('   <svg xmlns="http://www.w3.org/2000/svg"/>');

describe('sniffImageType', () => {
  it('detects PNG by signature', () => expect(sniffImageType(png)).toBe('image/png'));
  it('detects JPEG by signature', () => expect(sniffImageType(jpeg)).toBe('image/jpeg'));
  it('detects SVG by leading <?xml/<svg', () => expect(sniffImageType(svg)).toBe('image/svg+xml'));
  it('detects SVG without prolog after whitespace', () =>
    expect(sniffImageType(svgNoProlog)).toBe('image/svg+xml'));
  it('returns null for an unknown/spoofed blob', () =>
    expect(sniffImageType(Buffer.from('GIF89a not allowed'))).toBeNull());
});
```

### Step 3: Run it to verify it fails

Run: `npm test -- magic-bytes`
Expected: FAIL — `Cannot find module './magic-bytes'`.

### Step 4: Implement the magic-byte sniffer

Create `backend/src/shared/storage/magic-bytes.ts`:

```typescript
/**
 * Content-based image type detection (defense-in-depth for FR-037/§13). We sniff the actual
 * bytes instead of trusting the client-supplied `file.mimetype`. Deliberately tiny and
 * synchronous to avoid the ESM-only `file-type` package in this CommonJS build.
 */
export type SniffedImageType = 'image/png' | 'image/jpeg' | 'image/svg+xml';

export function sniffImageType(buf: Buffer): SniffedImageType | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // SVG is text: allow leading BOM/whitespace, then require `<?xml` or `<svg`.
  const head = buf.subarray(0, 256).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'image/svg+xml';
  return null;
}
```

### Step 5: Verify magic-bytes test passes

Run: `npm test -- magic-bytes`
Expected: PASS (5 tests).

### Step 6: Write the failing SVG-sanitizer test

Create `backend/src/shared/storage/svg-sanitizer.spec.ts`:

```typescript
import { sanitizeSvg } from './svg-sanitizer';

describe('sanitizeSvg', () => {
  it('strips <script> elements', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert/);
  });

  it('strips on* event handlers', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>');
    expect(out).not.toMatch(/onload/i);
  });

  it('strips <foreignObject> and external/script hrefs', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="javascript:alert(1)"/></body></foreignObject><a href="javascript:alert(1)">x</a></svg>',
    );
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/iframe/i);
  });

  it('keeps benign shapes', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>');
    expect(out).toMatch(/<circle/i);
    expect(out).toMatch(/<svg/i);
  });
});
```

### Step 7: Run it to verify it fails

Run: `npm test -- svg-sanitizer`
Expected: FAIL — `Cannot find module './svg-sanitizer'`.

### Step 8: Implement the SVG sanitizer

Create `backend/src/shared/storage/svg-sanitizer.ts`:

```typescript
import DOMPurify from 'isomorphic-dompurify';

/**
 * Strips active content from an SVG (FR-037/§13 — stored-XSS defense). Removes <script>,
 * on* handlers, <foreignObject>, and javascript:/data: hrefs. Returns sanitized SVG markup.
 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick'],
  });
}
```

> Note: DOMPurify's SVG profile already removes event handlers and `javascript:` URIs; the explicit `FORBID_*` lists make intent obvious and survive profile changes.

### Step 9: Verify sanitizer test passes

Run: `npm test -- svg-sanitizer`
Expected: PASS (4 tests).

### Step 10: Wire magic-byte validation into the pipe (failing test first)

Add to `backend/src/shared/storage/file-validation.spec.ts` (create if it only covers size/MIME today):

```typescript
import { ImageValidationPipe } from './file-validation';
import { AppErrorCode } from '@shared/common/errors/error-codes';

const file = (over: Partial<{ mimetype: string; buffer: Buffer; size: number }>) => ({
  originalname: 'x', size: 10, mimetype: 'image/png',
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), ...over,
});

it('rejects when declared MIME and sniffed bytes disagree', () => {
  const pipe = new ImageValidationPipe(['image/png', 'image/jpeg']);
  // claims png, but bytes are a script blob
  expect(() => pipe.transform(file({ mimetype: 'image/png', buffer: Buffer.from('<svg><script>') })))
    .toThrowMatching((e: { errorCode: string }) => e.errorCode === AppErrorCode.UNSUPPORTED_FILE_TYPE);
});
```

Run: `npm test -- file-validation` → Expected: FAIL (current pipe trusts `file.mimetype`).

### Step 11: Enforce magic bytes in `ImageValidationPipe`

In `backend/src/shared/storage/file-validation.ts`, import the sniffer and validate after the MIME allow-list check:

```typescript
import { sniffImageType } from './magic-bytes';
// ...
  transform(file: UploadedFile | undefined): UploadedFile {
    if (!file) {
      throw new AppException(AppErrorCode.VALIDATION_ERROR, {
        details: [{ field: 'file', message: 'A file is required' }],
      });
    }
    if (file.size > MAX_BYTES) throw new AppException(AppErrorCode.FILE_TOO_LARGE);
    if (!this.allowed.includes(file.mimetype)) {
      throw new AppException(AppErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    // §13: trust bytes, not the client-declared MIME. Sniffed type must be allowed AND match.
    const sniffed = sniffImageType(file.buffer);
    if (!sniffed || !this.allowed.includes(sniffed)) {
      throw new AppException(AppErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    return file;
  }
```

Run: `npm test -- file-validation` → Expected: PASS.

### Step 12: Sanitize SVG in `processLogo` (replace the pass-through)

In `backend/src/shared/storage/image.service.ts`, replace the SVG branch (lines 31-32):

```typescript
import { sanitizeSvg } from './svg-sanitizer';
// ...
  async processLogo(input: Buffer, mime: string): Promise<ProcessedImage> {
    if (mime === 'image/svg+xml') {
      const clean = sanitizeSvg(input.toString('utf8'));
      return { buffer: Buffer.from(clean, 'utf8'), contentType: mime, ext: 'svg' };
    }
    const out = await sharp(input)
      .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return { buffer: out, contentType: 'image/png', ext: 'png' };
  }
```

Add a matching assertion in `backend/src/shared/storage/image.service.spec.ts`:

```typescript
it('processLogo sanitizes an SVG payload', async () => {
  const svc = new ImageService();
  const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const out = await svc.processLogo(Buffer.from(malicious), 'image/svg+xml');
  expect(out.contentType).toBe('image/svg+xml');
  expect(out.buffer.toString('utf8')).not.toMatch(/<script/i);
});
```

Run: `npm test -- image.service` → Expected: PASS.

### Step 13: Fix L8 — local adapter honors `contentType` (sidecar) + safe-serving header note

In `backend/src/shared/storage/local-storage.adapter.ts`, accept and persist `contentType` so the future S3 adapter / any static server can set the right header and force download:

```typescript
async put(key: string, body: Buffer, contentType: string): Promise<PutResult> {
  const full = join(this.dir, key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
  // Persist the content-type as a sidecar so a future static server / S3 adapter can emit the
  // correct Content-Type + Content-Disposition: attachment (FR-037/§13 safe-serving contract).
  await writeFile(`${full}.meta.json`, JSON.stringify({ contentType }), 'utf8');
  const base = this.config.get<string>('STORAGE_PUBLIC_BASE_URL', 'http://localhost:3000/static');
  return { key, url: `${base}/${key}` };
}
```

Also update the file header comment to document the **serving contract** (no behavior beyond the sidecar in this task — there is no static route yet):

```typescript
/**
 * Dev adapter — writes to STORAGE_LOCAL_DIR, intended to be served at STORAGE_PUBLIC_BASE_URL.
 * SAFE-SERVING CONTRACT (FR-037/§13): user-uploaded assets MUST be served from a COOKIELESS
 * origin (prod: S3 + CDN) with `Content-Disposition: attachment` and `X-Content-Type-Options:
 * nosniff`. SVG is additionally sanitized at upload (image.service.processLogo). There is no
 * `/static` route in Epic-01; wiring one MUST honor this contract.
 */
```

> The `delete` method should also remove the sidecar — add `await rm(join(this.dir, \`${key}.meta.json\`), { force: true });`.

### Step 14: Document the serving contract in the architecture spec

Append a short subsection to `specs/architect-architecture.md` under file storage / security: "Uploaded-asset serving contract — cookieless origin, `Content-Disposition: attachment`, `nosniff`; SVG sanitized at upload (DOMPurify). Epic-01 stores only; serving lands with the S3 adapter."

### Step 15: Full gate + commit

Run: `npm run build && npm run lint && npm test`
Expected: all green; suite count grows by the new specs.

```bash
git add backend/package.json backend/package-lock.json backend/src/shared/storage specs/architect-architecture.md
git commit -m "fix(storage): sanitize SVG logos, validate by magic bytes, define safe-serving contract (C1, L8)"
```

---

## Task 2: Impersonation token TTL fix + expiry sweep job (H1)

**Finding:** H1 (High) — impersonation JWT expires at 15min (not 1h); abandoned/expired logs never close.
**Requirement:** FR-015, FR-016, BR-009, NFR-007.

**Files:**
- Modify: `backend/src/shared/auth/token.service.ts:58-63,132-141` (allow a per-token `expiresIn`)
- Create: `backend/src/modules/impersonation/impersonation.sweep.ts`
- Modify: `backend/src/modules/impersonation/impersonation.repository.ts` (add `closeExpiredOpenLogs`)
- Modify: `backend/src/modules/impersonation/impersonation.module.ts` (register the sweep)
- Test: `backend/src/shared/auth/token.service.spec.ts` (TTL assertion)
- Test: `backend/src/modules/impersonation/impersonation.sweep.spec.ts`

### Step 1: Write the failing TTL test

Add to `backend/src/shared/auth/token.service.spec.ts`:

```typescript
it('issueImpersonation signs with IMPERSONATION_TTL, not the 15min access TTL', async () => {
  // config returns IMPERSONATION_TTL=3600, ACCESS_TOKEN_TTL=900
  const token = await service.issueImpersonation(baseClaims, 'admin-1');
  const decoded = jwtService.decode(token) as { exp: number; iat: number };
  expect(decoded.exp - decoded.iat).toBe(3600); // would be 900 before the fix
});
```

> Match the existing spec's setup (how `service`, `jwtService`, and the config mock are built). The config mock must return `3600` for `IMPERSONATION_TTL` and `900` for `ACCESS_TOKEN_TTL`.

### Step 2: Run it to verify it fails

Run: `npm test -- token.service`
Expected: FAIL — `exp - iat` is `900`.

### Step 3: Let `signAccess` accept an explicit TTL; impersonation uses `IMPERSONATION_TTL`

In `backend/src/shared/auth/token.service.ts`:

```typescript
signAccess(claims: AccessClaims, expiresInSec?: number): Promise<string> {
  return this.jwt.signAsync(claims, {
    secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
    expiresIn: expiresInSec ?? Number(this.config.get('ACCESS_TOKEN_TTL', 900)),
  });
}
```

And fix `issueImpersonation` (the `impersonationExp` claim now lines up with the JWT `exp`, making the guard's check authoritative and matching the cookie `maxAge`):

```typescript
issueImpersonation(target: Omit<AccessClaims, 'family'>, adminId: string): Promise<string> {
  const ttl = Number(this.config.get('IMPERSONATION_TTL', 3600));
  return this.signAccess(
    {
      ...target,
      family: `imp:${adminId}`,
      impersonatorAdminId: adminId,
      impersonationExp: Math.floor(Date.now() / 1000) + ttl,
    } as AccessClaims,
    ttl,
  );
}
```

Run: `npm test -- token.service` → Expected: PASS.

### Step 4: Add `closeExpiredOpenLogs` to the repository (failing test first)

Add a repository method that closes every open log whose start is older than the impersonation TTL. Write `backend/src/modules/impersonation/impersonation.sweep.spec.ts` first:

```typescript
import { ImpersonationSweep } from './impersonation.sweep';

describe('ImpersonationSweep', () => {
  it('tick() closes expired open logs via the repository', async () => {
    const closeExpiredOpenLogs = jest.fn().mockResolvedValue(2);
    const repo = { closeExpiredOpenLogs } as never;
    const config = { get: (_k: string, d?: unknown) => d } as never;
    const sweep = new ImpersonationSweep(repo, config);
    await sweep.tick();
    expect(closeExpiredOpenLogs).toHaveBeenCalledWith(expect.any(Number));
  });

  it('does not overlap runs', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const closeExpiredOpenLogs = jest.fn().mockReturnValue(gate.then(() => 0));
    const sweep = new ImpersonationSweep({ closeExpiredOpenLogs } as never, { get: (_k, d) => d } as never);
    const first = sweep.tick();
    await sweep.tick(); // should early-return while first is in flight
    expect(closeExpiredOpenLogs).toHaveBeenCalledTimes(1);
    resolve();
    await first;
  });
});
```

Run: `npm test -- impersonation.sweep` → Expected: FAIL (`Cannot find module './impersonation.sweep'`).

### Step 5: Implement the repository method

Add to `backend/src/modules/impersonation/impersonation.repository.ts` (uses the system pool, computes `durationSec` from `startedAt`):

```typescript
import { and, isNull, lt, sql } from 'drizzle-orm';
// ...
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
```

### Step 6: Implement the sweep (OutboxRelay pattern)

Create `backend/src/modules/impersonation/impersonation.sweep.ts`:

```typescript
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImpersonationRepository } from './impersonation.repository';

/** Closes impersonation logs left open by expiry/abandonment (FR-016). Mirrors OutboxRelay. */
@Injectable()
export class ImpersonationSweep implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ImpersonationSweep');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repo: ImpersonationRepository,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get('IMPERSONATION_SWEEP_ENABLED', 'true') === 'false') return;
    const ms = Number(this.config.get('IMPERSONATION_SWEEP_MS', 60_000));
    this.timer = setInterval(() => void this.tick(), ms);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const ttl = Number(this.config.get('IMPERSONATION_TTL', 3600));
      const closed = await this.repo.closeExpiredOpenLogs(ttl);
      if (closed > 0) this.logger.log(`closed ${closed} expired impersonation log(s)`);
    } catch (err) {
      this.logger.error(`sweep tick failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
```

### Step 7: Register the sweep

In `backend/src/modules/impersonation/impersonation.module.ts`, add `ImpersonationSweep` to `providers`.

Run: `npm test -- impersonation` → Expected: PASS (sweep + existing service specs).

### Step 8: Gate + commit

Run: `npm run build && npm run lint && npm test`

```bash
git add backend/src/shared/auth/token.service.ts backend/src/shared/auth/token.service.spec.ts backend/src/modules/impersonation
git commit -m "fix(impersonation): sign tokens with IMPERSONATION_TTL + sweep abandoned logs (H1)"
```

---

## Task 3: Deactivation revokes active sessions (H2)

**Finding:** H2 (High) — `deactivate()` never revokes tokens; deactivated user keeps a working access token ~15min.
**Requirement:** FR-013, BR-010.

**Files:**
- Modify: `backend/src/modules/users/user-admin.service.ts:104-115`
- Test: `backend/src/modules/users/user-admin.service.spec.ts`

### Step 1: Write the failing test

Add to the `deactivate/reactivate/get` describe block in `user-admin.service.spec.ts` (extend the `make` helper to inject a `TokenService` mock — mirror how `AnonymizationService` is tested):

```typescript
it('deactivate revokes all of the user’s sessions', async () => {
  const revokeAllForUser = jest.fn().mockResolvedValue(undefined);
  const repo = {
    findById: jest.fn().mockResolvedValue(userRow()),
    setStatus: jest.fn().mockResolvedValue(userRow({ status: 'INACTIVE' })),
  } as unknown as UsersRepository;
  const tokens = { revokeAllForUser } as unknown as TokenService;
  const svc = new UserAdminService(repo, {} as PasswordService, { log: jest.fn() } as never, { get: (_k, d) => d } as never, tokens);
  await svc.deactivate('u1', {});
  expect(revokeAllForUser).toHaveBeenCalledWith('u1');
});
```

> This requires adding `TokenService` to the `UserAdminService` constructor. Update the existing `make` helper and the `createTrainer` describe's instantiation accordingly so the suite compiles.

### Step 2: Run it to verify it fails

Run: `npm test -- user-admin.service`
Expected: FAIL — constructor arity / `revokeAllForUser` not called.

### Step 3: Inject `TokenService` and revoke on deactivate

In `backend/src/modules/users/user-admin.service.ts`:

```typescript
import { TokenService } from '@shared/auth/token.service';
// constructor:
constructor(
  private readonly repo: UsersRepository,
  private readonly passwords: PasswordService,
  private readonly audit: AuditService,
  private readonly config: ConfigService,
  private readonly tokens: TokenService,
) {}
// deactivate():
async deactivate(id: string, dto: DeactivateUserDto): Promise<UserResponseDto> {
  const user = await this.repo.findById(id);
  if (!user) throw new AppException(AppErrorCode.NOT_FOUND);
  const updated = await this.repo.setStatus(id, 'INACTIVE');
  await this.tokens.revokeAllForUser(id); // FR-013/BR-010: immediate lockout
  await this.audit.log({
    action: 'user.deactivate',
    entityType: 'user',
    entityId: id,
    metadata: dto.reason ? { reason: dto.reason } : undefined,
  });
  return this.toResponse(updated!);
}
```

> Confirm `UsersModule` already has `TokenService` available (it's provided by `AuthSharedModule`, which is global — verify it imports/exposes `TokenService`; `AnonymizationService` already depends on it, so the wiring exists).

### Step 4: Run tests

Run: `npm test -- user-admin.service` → Expected: PASS.

### Step 5: (e2e, where infra available) add coverage

In the e2e suite, assert a deactivated user's existing access cookie is rejected on the next request (401). Add to `backend/test/auth.e2e-spec.ts` or a new `users.e2e-spec.ts`.

### Step 6: Gate + commit

```bash
git add backend/src/modules/users/user-admin.service.ts backend/src/modules/users/user-admin.service.spec.ts
git commit -m "fix(users): revoke active sessions on deactivate (H2)"
```

---

## Task 4: `/join` existing-user branch honors link type + single-use (M1)

**Finding:** M1 (Medium) — `associateExisting()` always associates a *player* and never consumes single-use links; an existing user clicking a single-use coach-invite gets a player association and the link stays usable.
**Requirement:** FR-018, FR-028, FR-029, BR-011.

**Files:**
- Modify: `backend/src/modules/sharelinks/join.service.ts:154-200`
- Test: `backend/src/modules/sharelinks/join.service.spec.ts` (create if absent) or `association.service.spec.ts` sibling

### Step 1: Decide the behavior (matches `registerNew`)

- `link.type === 'static'` → player self/child association (current behavior), `useCount + 1`, **no** terminal transition (static is multi-use).
- `link.type === 'unique'` (coach invite): an already-logged-in user joining via a coach link should be handled like `registerNew`'s coach path — but an *existing arbitrary user* becoming a coach is out of Epic-01 scope. Per FR-029/BR-011, **reject** the existing-user path for `unique` links with a clear error, OR (if the existing user is the invited coach) associate the coach and consume the link. The safe, in-scope fix: **reject `unique` links in `associateExisting` and consume single-use on any path that does succeed.** Coach onboarding for brand-new users stays in `registerNew`.

### Step 2: Write the failing tests

In `backend/src/modules/sharelinks/join.service.spec.ts`:

```typescript
it('associateExisting rejects a unique (coach-invite) link', async () => {
  // lockValidLink returns a link with type:'unique'
  await expect(svc.associateExisting('code', playerPrincipal, {}))
    .rejects.toMatchObject({ errorCode: AppErrorCode.VALIDATION_ERROR });
});

it('associateExisting consumes a unique link if it is allowed to succeed', async () => {
  // if your decision allows the invited coach path, assert status:'ACCEPTED', active:false on the update
});
```

> Mock the `db.transaction` to invoke the callback with a `tx` whose `select(...).for('update')...` resolves the chosen link shape. Mirror the transaction-mocking already used in sharelinks specs.

### Step 3: Run to verify failure

Run: `npm test -- join.service` → Expected: FAIL.

### Step 4: Branch on `link.type` and enforce single-use

In `associateExisting`, after `lockValidLink`:

```typescript
const link = await this.lockValidLink(tx, code);
if (link.type === 'unique') {
  // Coach invites are consumed by registerNew (new account). An already-logged-in user
  // cannot self-convert to a coach in Epic-01 (FR-029/BR-011).
  throw new AppException(AppErrorCode.VALIDATION_ERROR, {
    details: [{ field: 'code', message: 'This invite must be redeemed by creating an account.' }],
  });
}
// ... existing player-association logic (static link) ...
await tx
  .update(shareLinks)
  .set({ useCount: link.useCount + 1, updatedAt: new Date() }) // static: multi-use, no terminal transition
  .where(eq(shareLinks.id, link.id));
```

> If the requester later wants the invited-coach existing-user path, add a branch that verifies `principal` matches `link.targetEmail`, associates the coach via `associations.associateCoach`, and sets `{ useCount + 1, status: 'ACCEPTED', active: false }` — symmetric with `registerNew`. Keep that out of this task unless requested.

### Step 5: Run tests → PASS, then gate + commit

```bash
git add backend/src/modules/sharelinks/join.service.ts backend/src/modules/sharelinks/join.service.spec.ts
git commit -m "fix(sharelinks): honor link type + single-use in existing-user join branch (M1)"
```

---

## Task 5: Trainer override requires active association + reason validation (M2, L5)

**Findings:** M2 (Medium — trainer can override any org's coach), L5 (Low — override `reason` not `@IsString`/trimmed).
**Requirement:** FR-031, FR-035, NFR-011.

**Files:**
- Modify: `backend/src/modules/availability/availability.repository.ts:113-121` (rename + real association check)
- Modify: `backend/src/modules/availability/availability.service.ts:86-98`
- Modify: `backend/src/modules/availability/dto/availability.dto.ts:69-80` (L5)
- Test: `backend/src/modules/availability/availability.service.spec.ts`

### Step 1: Write the failing service test

Add to `availability.service.spec.ts`:

```typescript
it('createOverride rejects a coach not actively associated with the trainer', async () => {
  const svc = make({ activeCoachAssociationExists: jest.fn().mockResolvedValue(false) });
  await expect(
    svc.createOverride(principal({ id: 'tr', role: 'TRAINER' }), { eventId: 'e', coachId: 'c', reason: 'sick' }),
  ).rejects.toMatchObject({ errorCode: AppErrorCode.TENANT_FORBIDDEN });
});

it('createOverride writes when an active association exists', async () => {
  const createOverride = jest.fn().mockResolvedValue({ id: 'o', eventId: 'e', coachId: 'c', overriddenBy: 'tr', reason: 'sick', createdAt: new Date() });
  const svc = make({ activeCoachAssociationExists: jest.fn().mockResolvedValue(true), createOverride });
  const out = await svc.createOverride(principal({ id: 'tr', role: 'TRAINER' }), { eventId: 'e', coachId: 'c', reason: 'sick' });
  expect(out.id).toBe('o');
});
```

Run: `npm test -- availability.service` → Expected: FAIL.

### Step 2: Replace the misleading repo method with a real association check

In `availability.repository.ts`, remove `trainerExistsForCoach` and add (scoped read so RLS permits it for the trainer):

```typescript
import { trainerCoachAssociations } from '@shared/database/schema';
// ...
/** Active (trainer, coach) association — scoped so RLS allows the trainer to read it. */
activeCoachAssociationExists(trainerId: string, coachProfileId: string): Promise<boolean> {
  return this.tenancy.runScoped(async (tx) => {
    const [row] = await tx
      .select({ id: trainerCoachAssociations.id })
      .from(trainerCoachAssociations)
      .where(
        and(
          eq(trainerCoachAssociations.trainerId, trainerId),
          eq(trainerCoachAssociations.coachProfileId, coachProfileId),
          eq(trainerCoachAssociations.status, 'active'),
        ),
      )
      .limit(1);
    return !!row;
  }, trainerId);
}
```

### Step 3: Enforce it in the service

In `availability.service.ts` `createOverride`:

```typescript
async createOverride(principal: SessionPrincipal, dto: OverrideDto) {
  const trainerId = this.tenancy.currentTrainerId();
  if (!(await this.repo.activeCoachAssociationExists(trainerId, dto.coachId))) {
    throw new AppException(AppErrorCode.TENANT_FORBIDDEN);
  }
  // ... unchanged: createOverride + audit + response ...
}
```

> `dto.coachId` is a coach **profile** id (it writes `coachId: row.coachId` and the schema's FK is `coach_profile_id`) — confirm the association lookup uses `coachProfileId` consistently. Adjust the DTO field doc to say "coach profile id".

### Step 4: Fix L5 — `reason` validation

In `availability.dto.ts` `OverrideDto`:

```typescript
import { Transform } from 'class-transformer';
// ...
@ApiProperty({ description: 'Required reason — logged to AvailabilityOverride (FR-031)' })
@IsString()
@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
@IsNotEmpty()
@MaxLength(500)
reason: string;
```

> Order matters: `@Transform` trims before `@IsNotEmpty` runs, so a whitespace-only reason now fails validation.

### Step 5: Run tests → PASS, then gate + commit

```bash
git add backend/src/modules/availability
git commit -m "fix(availability): require active coach association for overrides + validate reason (M2, L5)"
```

---

## Task 6: 48h approval auto-deny sweep (M3)

**Finding:** M3 (Medium) — expiry is lazy (read-time only); `PENDING` rows never reach a terminal state and no notification fires.
**Requirement:** FR-024, BR-008.

**Files:**
- Create: `backend/src/modules/family/approval-expiry.sweep.ts`
- Modify: `backend/src/modules/family/family.repository.ts` (add `expirePending`)
- Modify: `backend/src/modules/family/family.module.ts` (register sweep; ensure `OutboxService` available)
- Test: `backend/src/modules/family/approval-expiry.sweep.spec.ts`

### Step 1: Add `expirePending` to the repository (system pool — spans tenants)

```typescript
import { lt } from 'drizzle-orm';
// ...
/** Transition PENDING approvals past their window to EXPIRED. Returns the rows transitioned. */
async expirePending(): Promise<{ id: string; parentUserId: string; itemRef: string }[]> {
  return this.system
    .update(childPurchaseApprovals)
    .set({ status: 'EXPIRED', respondedAt: sql`now()` })
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
```

> Use `this.system` (BYPASSRLS) because the sweep has no tenant session — mirror `findShareLinkByCode`/`trainerExists`. Import `sql` from `drizzle-orm`.

### Step 2: Write the failing sweep test

`backend/src/modules/family/approval-expiry.sweep.spec.ts`:

```typescript
import { ApprovalExpirySweep } from './approval-expiry.sweep';

it('tick() expires pending approvals and enqueues a notification per row', async () => {
  const expirePending = jest.fn().mockResolvedValue([{ id: 'a1', parentUserId: 'p1', itemRef: 'kit' }]);
  const getUserEmail = jest.fn().mockResolvedValue('p@x.com');
  const enqueue = jest.fn();
  const db = { transaction: (fn: (tx: unknown) => unknown) => fn({}) };
  const sweep = new ApprovalExpirySweep(
    { expirePending, getUserEmail } as never,
    { enqueue } as never,
    { get: (_k: string, d?: unknown) => d } as never,
    db as never,
  );
  await sweep.tick();
  expect(expirePending).toHaveBeenCalled();
  expect(enqueue).toHaveBeenCalledWith({}, 'email.child.approval-expired', expect.objectContaining({ to: 'p@x.com' }));
});
```

Run: `npm test -- approval-expiry.sweep` → Expected: FAIL.

### Step 3: Implement the sweep

`backend/src/modules/family/approval-expiry.sweep.ts` (OutboxRelay pattern; enqueues a notification per expired row):

```typescript
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '@shared/database/drizzle.constants';
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { OutboxService } from '@shared/messaging/outbox.service';
import { FamilyRepository } from './family.repository';

@Injectable()
export class ApprovalExpirySweep implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ApprovalExpirySweep');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repo: FamilyRepository,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  onModuleInit(): void {
    if (this.config.get('APPROVAL_SWEEP_ENABLED', 'true') === 'false') return;
    const ms = Number(this.config.get('APPROVAL_SWEEP_MS', 60_000));
    this.timer = setInterval(() => void this.tick(), ms);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.repo.expirePending();
      const base = this.config.get('APP_BASE_URL', 'http://localhost:5173');
      for (const row of expired) {
        const email = await this.repo.getUserEmail(row.parentUserId);
        if (!email) continue;
        await this.db.transaction((tx) =>
          this.outbox.enqueue(tx, 'email.child.approval-expired', {
            to: email,
            templateId: 'child.approval-expired',
            vars: { item: row.itemRef, link: `${base}/family` },
          }),
        );
      }
      if (expired.length) this.logger.log(`expired ${expired.length} approval(s)`);
    } catch (err) {
      this.logger.error(`approval sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
```

> Add the `child.approval-expired` template id to `backend/src/shared/mailer/templates.ts` (and a template body) so the outbox relay can dispatch it. `decide()`'s existing `APPROVAL_EXPIRED` guard still protects the race where a row expires between read and decide.

### Step 4: Register + wire

In `family.module.ts`, add `ApprovalExpirySweep` to `providers`. `OutboxService` is exported by the global `MessagingModule`; `DRIZZLE` is global.

Run: `npm test -- family` → Expected: PASS.

### Step 5: Gate + commit

```bash
git add backend/src/modules/family backend/src/shared/mailer/templates.ts
git commit -m "feat(family): persist 48h approval auto-deny via sweep + notify parent (M3)"
```

---

## Task 7: Multer `fileSize` limit before buffering (M4)

**Finding:** M4 (Medium) — `FileInterceptor('file')` has no `limits`; the 2MB check runs only after multer buffers the whole body.
**Requirement:** FR-037, FR-038, §13.

**Files:**
- Modify: `backend/src/modules/branding/branding.controller.ts:61`
- Modify: `backend/src/modules/profiles/profile.controller.ts:55`
- Create: `backend/src/shared/storage/upload.constants.ts` (shared limit; DRY)

### Step 1: Add a shared limit constant

`backend/src/shared/storage/upload.constants.ts`:

```typescript
/** FR-037/FR-038/§13 — hard upload ceiling enforced by multer before buffering. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
export const UPLOAD_LIMITS = { fileSize: MAX_UPLOAD_BYTES, files: 1 } as const;
```

> Optionally re-export `MAX_BYTES` in `file-validation.ts` from this constant to remove the duplicate `2 * 1024 * 1024` (DRY).

### Step 2: Apply to both interceptors

Branding (`branding.controller.ts`):

```typescript
import { UPLOAD_LIMITS } from '@shared/storage/upload.constants';
// ...
@UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
```

Profiles (`profile.controller.ts`): same change on the `photo` handler.

### Step 3: Verify behavior

Multer now rejects oversize uploads at the stream layer (throws `LIMIT_FILE_SIZE`). Confirm `AllExceptionsFilter` maps the multer error to a sane response (it currently maps unknowns to a generic 500). Add a small mapping so the limit surfaces as `FILE_TOO_LARGE` (413):

- In `backend/src/shared/common/errors/all-exceptions.filter.ts`, detect `err?.code === 'LIMIT_FILE_SIZE'` (or `MulterError`) and translate to `AppException(AppErrorCode.FILE_TOO_LARGE)`.

Add/extend a filter unit test asserting a `MulterError('LIMIT_FILE_SIZE')` → 413 + `FILE_TOO_LARGE`.

### Step 4: Gate + commit

```bash
npm run build && npm run lint && npm test
git add backend/src/modules/branding/branding.controller.ts backend/src/modules/profiles/profile.controller.ts backend/src/shared/storage/upload.constants.ts backend/src/shared/common/errors/all-exceptions.filter.ts
git commit -m "fix(storage): cap upload size at the multer layer before buffering (M4)"
```

---

## Task 8: CORS before CSRF + non-permissive origin (M5)

**Finding:** M5 (Medium) — CORS registered after CSRF (403s carry no CORS headers); `origin ?? true` reflects any origin with credentials when `APP_BASE_URL` is unset.
**Requirement:** FR-009, §13.

**Files:**
- Modify: `backend/src/app.setup.ts:16-29`
- Test: `backend/test/auth.e2e-spec.ts` (header assertions) and/or a unit test on the origin resolver

### Step 1: Reorder + harden origin

Rewrite `configureApp` so CORS is enabled **before** CSRF, and the origin never falls back to `true` with credentials:

```typescript
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  // CORS must run BEFORE CSRF so cross-origin CSRF 403s still carry CORS headers (M5).
  const origins = config.get<string>('APP_BASE_URL')?.split(',').map((o) => o.trim()).filter(Boolean);
  if (!origins || origins.length === 0) {
    // Fail loud rather than reflect any origin with credentials.
    throw new Error('APP_BASE_URL must be set to an explicit allow-list (CORS + credentials).');
  }
  app.enableCors({ origin: origins, credentials: true });

  const csrf = app.get(CsrfService);
  app.use(csrf.sessionMiddleware);
  app.use(csrf.protection);
  app.use(csrf.errorHandler);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
  app.useGlobalFilters(new AllExceptionsFilter());
}
```

> The e2e `app.factory.ts` and local `.env` must set `APP_BASE_URL` (e.g. `http://localhost:5173`). Update `.env.example` accordingly. This pairs with M7, which adds `APP_BASE_URL` to env validation — after both, the throw here is belt-and-suspenders.

### Step 2: e2e assertion (where infra available)

Assert a cross-origin request that fails CSRF still returns `Access-Control-Allow-Origin` for an allow-listed origin, and that a non-listed origin is not reflected.

### Step 3: Gate + commit

```bash
git add backend/src/app.setup.ts backend/.env.example
git commit -m "fix(bootstrap): register CORS before CSRF + require explicit origin allow-list (M5)"
```

---

## Task 9: Outbox relay reliability (M6)

**Finding:** M6 (Medium) — emails sent inside the `FOR UPDATE` tx (network I/O under row locks); no retry cap/backoff/DLQ; send-then-mark can double-send; no idempotency.
**Requirement:** NFR-008.

**Files:**
- Modify: `backend/src/shared/database/schema/enums.ts:25` (add `DEAD`)
- Modify: `backend/src/shared/database/schema/outbox.ts` (add `dedupeKey`, optional unique)
- Modify: `backend/src/shared/messaging/outbox.service.ts` (accept `dedupeKey`)
- Modify: `backend/src/shared/messaging/outbox.relay.ts:43-77` (claim→commit→send→mark; backoff; DEAD)
- Migration: `npm run db:generate`
- Test: `backend/src/shared/messaging/outbox.relay.spec.ts` (create)

> This is the most involved Medium. Implement in clear sub-steps; keep "exactly-once" honest — the design is **at-least-once with leasing + a dedupe key**, documented as such.

### Step 1: Schema — add `DEAD` + `dedupeKey`

In `enums.ts`:

```typescript
export const outboxStatusEnum = pgEnum('outbox_status', ['PENDING', 'SENT', 'FAILED', 'DEAD']);
```

In `outbox.ts`, add a nullable dedupe key with a unique index (idempotent enqueue):

```typescript
dedupeKey: varchar('dedupe_key', { length: 200 }),
// in the index array:
uniqueIndex('outbox_dedupe_key_unique').on(t.dedupeKey).where(sql`dedupe_key is not null`),
```

Run: `npm run db:generate`
Expected: a new `drizzle/NNNN_*.sql`. **Open it** — confirm the enum `ADD VALUE 'DEAD'` and the new column/index. (Postgres can't `ALTER TYPE ... ADD VALUE` inside a transaction in some setups; if drizzle wraps it, split that statement out. Note this in the migration's header comment.)

### Step 2: `OutboxService.enqueue` accepts a dedupe key

```typescript
async enqueue(
  tx: DrizzleDB,
  type: string,
  payload: Record<string, unknown>,
  opts: { availableAt?: Date; dedupeKey?: string } = {},
): Promise<void> {
  await tx
    .insert(outboxMessages)
    .values({ type, payload, availableAt: opts.availableAt ?? new Date(), dedupeKey: opts.dedupeKey })
    .onConflictDoNothing({ target: outboxMessages.dedupeKey }); // idempotent on dedupeKey
}
```

> Existing callers keep working (the 4th positional `availableAt` becomes `opts.availableAt`; update the 2-3 call sites that passed a `Date` positionally — grep for `outbox.enqueue(`).

### Step 3: Write the failing relay tests

`backend/src/shared/messaging/outbox.relay.spec.ts` — assert (a) dispatch happens **outside** the claim tx, (b) a permanently-failing message increments attempts and gets `availableAt` pushed out (backoff), (c) after `MAX_ATTEMPTS` it becomes `DEAD`, (d) a successful send marks `SENT`. Mock `db.transaction`, the row queries, and a `MailerService` that throws/succeeds. Mirror the existing OutboxRelay structure.

### Step 4: Refactor the relay to claim → commit → send → mark

Rewrite `tick()`:

```typescript
private readonly MAX_ATTEMPTS = 6;

async tick(): Promise<void> {
  if (this.running) return;
  this.running = true;
  try {
    // 1) CLAIM: lease a batch in its own short tx (no network I/O under lock).
    const claimed = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outboxMessages)
        .where(and(eq(outboxMessages.status, 'PENDING'), lte(outboxMessages.availableAt, new Date())))
        .orderBy(outboxMessages.availableAt)
        .limit(20)
        .for('update', { skipLocked: true });
      if (rows.length) {
        const leaseUntil = new Date(Date.now() + this.leaseMs);
        await tx
          .update(outboxMessages)
          .set({ availableAt: leaseUntil, attempts: sql`${outboxMessages.attempts} + 1` })
          .where(inArray(outboxMessages.id, rows.map((r) => r.id)));
      }
      return rows;
    });

    // 2) SEND each OUTSIDE any tx; 3) MARK terminal/backoff per row.
    for (const row of claimed) {
      const attempt = row.attempts + 1; // we incremented at claim
      try {
        await this.dispatch(row.type, row.payload as Record<string, unknown>);
        await this.db
          .update(outboxMessages)
          .set({ status: 'SENT', processedAt: new Date() })
          .where(eq(outboxMessages.id, row.id));
      } catch (err) {
        this.logger.warn(`outbox ${row.id} (${row.type}) attempt ${attempt} failed: ${String(err)}`);
        if (attempt >= this.MAX_ATTEMPTS) {
          await this.db.update(outboxMessages).set({ status: 'DEAD' }).where(eq(outboxMessages.id, row.id));
        } else {
          const backoffMs = Math.min(2 ** attempt * 1000, 5 * 60_000); // capped exponential
          await this.db
            .update(outboxMessages)
            .set({ availableAt: new Date(Date.now() + backoffMs) })
            .where(eq(outboxMessages.id, row.id));
        }
      }
    }
  } catch (err) {
    this.logger.error(`relay tick failed: ${String(err)}`);
  } finally {
    this.running = false;
  }
}
```

Add `private get leaseMs() { return Number(this.config.get('OUTBOX_LEASE_MS', 30_000)); }` and import `inArray`.

> Semantics: claim leases rows by pushing `availableAt` to `now + lease` and incrementing `attempts`, so other nodes skip them; send happens with no locks held; on failure we either dead-letter or back off. This is **at-least-once** (a crash after send but before mark re-sends after the lease) — acceptable for email; the `dedupeKey` prevents duplicate *enqueues*. Document this in the relay header comment.

### Step 5: Tests → PASS, gate, commit

```bash
npm run build && npm run lint && npm test
git add backend/src/shared/database/schema backend/src/shared/messaging backend/drizzle
git commit -m "fix(messaging): reliable outbox relay — lease/commit/send/mark, backoff, DEAD, idempotency (M6)"
```

---

## Task 10: Env/secret validation hardening (M7)

**Finding:** M7 (Medium) — JWT/CSRF secrets only `@IsString()`; `access==refresh` passes; runtime vars (`COOKIE_SECURE`, TTLs, `APP_BASE_URL`, drivers) absent from the schema.
**Requirement:** NFR-006, §13.

**Files:**
- Modify: `backend/src/shared/config/env.validation.ts`
- Test: `backend/src/shared/config/env.validation.spec.ts` (create)

### Step 1: Write the failing tests

`env.validation.spec.ts`:

```typescript
import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://x',
  JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32), CSRF_SECRET: 'c'.repeat(32),
  APP_BASE_URL: 'http://localhost:5173',
};

it('rejects a short secret', () => {
  expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow();
});
it('rejects access === refresh secret', () => {
  expect(() => validateEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/distinct/i);
});
it('rejects missing APP_BASE_URL', () => {
  const { APP_BASE_URL, ...noBase } = base;
  expect(() => validateEnv(noBase)).toThrow();
});
it('accepts a valid config and applies COOKIE_SECURE default', () => {
  const out = validateEnv(base);
  expect(out.COOKIE_SECURE).toBeDefined();
});
```

Run: `npm test -- env.validation` → Expected: FAIL.

### Step 2: Strengthen the schema

```typescript
import { plainToInstance } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, IsUrl, MinLength, validateSync } from 'class-validator';

class EnvVars {
  @IsString() DATABASE_URL: string;
  @IsString() @MinLength(32) JWT_ACCESS_SECRET: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET: string;
  @IsString() REDIS_URL: string;
  @IsString() @MinLength(32) CSRF_SECRET: string;
  @IsString() APP_BASE_URL: string; // explicit CORS allow-list (pairs with M5)

  @IsOptional() @IsString() SYSTEM_DATABASE_URL?: string;
  @IsOptional() @IsString() MIGRATION_DATABASE_URL?: string;

  // Runtime-consumed vars (defaults applied below).
  @IsOptional() @IsBooleanString() COOKIE_SECURE?: string;
  @IsOptional() @IsInt() ACCESS_TOKEN_TTL?: number;
  @IsOptional() @IsInt() REFRESH_TOKEN_TTL?: number;
  @IsOptional() @IsInt() IMPERSONATION_TTL?: number;
  @IsOptional() @IsIn(['local', 's3']) STORAGE_DRIVER?: string;
  @IsOptional() @IsIn(['console', 'smtp']) MAILER_DRIVER?: string;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });
  if (errors.length) {
    const detail = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`).join(' | ');
    throw new Error(`Invalid/missing environment variables: ${detail}`);
  }
  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct.');
  }
  // Safe defaults for runtime vars that must never be insecure-by-omission.
  return { COOKIE_SECURE: 'true', ...config };
}
```

> `COOKIE_SECURE` defaults to `'true'` so production never silently issues non-secure cookies; dev `.env` can set `COOKIE_SECURE=false`. Confirm the cookie-setting code (`@shared/auth/cookies.ts`) reads `COOKIE_SECURE` and update `.env.example` with all the new vars + comments.

### Step 3: Tests → PASS, gate, commit

```bash
git add backend/src/shared/config/env.validation.ts backend/src/shared/config/env.validation.spec.ts backend/.env.example
git commit -m "fix(config): enforce secret length, distinct JWT secrets, runtime env vars (M7)"
```

---

## Task 11: DB hardening migration — keyset indexes + child-age CHECK (L1, L2)

**Findings:** L1 (missing composite indexes on `share_links` + `child_purchase_approvals`), L2 (no DB CHECK for child age 1–18).
**Requirement:** NFR-002, BR-013.

**Files:**
- Modify: `backend/src/shared/database/schema/sharelinks.ts` (add `(created_at, id)` index)
- Modify: `backend/src/shared/database/schema/family.ts` (add `(requested_at, id)` index)
- Modify: `backend/src/shared/database/schema/profiles.ts` (add age CHECK)
- Migration: `npm run db:generate`

### Step 1: Add the keyset indexes

`sharelinks.ts` index array:

```typescript
index('share_links_created_id_idx').on(t.createdAt, t.id),
```

`family.ts` `childPurchaseApprovals` index array (paginates on `requested_at, id`):

```typescript
index('approvals_requested_id_idx').on(t.requestedAt, t.id),
```

> These mirror the existing `users_created_id_idx`. They back the keyset queries in `sharelinks.repository.ts` and `family.repository.ts`.

### Step 2: Add the child-age CHECK

`profiles.ts` `playerProfiles` — add to the table's third-arg array:

```typescript
import { check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// ...
check('player_age_range', sql`age IS NULL OR (age BETWEEN 1 AND 18)`),
```

### Step 3: Generate + inspect the migration

Run: `npm run db:generate`
Expected: a new `drizzle/NNNN_*.sql` with two `CREATE INDEX` and one `ADD CONSTRAINT ... CHECK`. Open it and confirm. (No RLS change — `npm run db:rls` is unaffected.)

### Step 4: Verify build + commit

```bash
npm run build && npm run lint && npm test
git add backend/src/shared/database/schema backend/drizzle
git commit -m "perf(db): add keyset indexes + child-age CHECK constraint (L1, L2)"
```

---

## Task 12: Availability excludes soft-deleted players (L4)

**Finding:** L4 (Low) — availability reads/writes ignore `playerProfiles.deletedAt`, so soft-deleted players remain readable/writable.
**Requirement:** BR-010 (consistency with the family module, which already filters `deletedAt`).

**Files:**
- Modify: `backend/src/modules/availability/availability.repository.ts:61-63,84-96`
- Test: `backend/src/modules/availability/availability.service.spec.ts`

### Step 1: Failing test

```typescript
it('getFor → NOT_FOUND for a soft-deleted player', async () => {
  const svc = make({ getPlayerProfile: jest.fn().mockResolvedValue(undefined) }); // repo now filters deletedAt
  await expect(svc.getFor(principal(), 'player', 'pp')).rejects.toMatchObject({ errorCode: AppErrorCode.NOT_FOUND });
});
```

### Step 2: Filter `deletedAt` in the repo

`getPlayerProfile`:

```typescript
import { and, eq, inArray, isNull } from 'drizzle-orm';
// ...
getPlayerProfile(id: string) {
  return this.db
    .select()
    .from(playerProfiles)
    .where(and(eq(playerProfiles.id, id), isNull(playerProfiles.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
}
```

And `listAssociatedPlayers` — add `isNull(playerProfiles.deletedAt)` to the join's `where`.

### Step 3: Tests → PASS, gate, commit

```bash
git add backend/src/modules/availability/availability.repository.ts backend/src/modules/availability/availability.service.spec.ts
git commit -m "fix(availability): exclude soft-deleted players from read/write (L4)"
```

---

## Task 13: Cursor `createdAt` value validation (L6)

**Finding:** L6 (Low) — `decodeCursor` shape-checks but doesn't validate the `createdAt` value; a tampered value becomes `Invalid Date` → silently wrong/empty page.
**Requirement:** NFR-002 robustness.

**Files:**
- Modify: `backend/src/shared/common/pagination/cursor.util.ts:13-23`
- Test: `backend/src/shared/common/pagination/cursor.util.spec.ts`

### Step 1: Failing test

```typescript
it('rejects a cursor with an unparseable createdAt', () => {
  const tampered = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'x' })).toString('base64url');
  expect(() => decodeCursor(tampered)).toThrowMatching((e: { errorCode: string }) => e.errorCode === 'VALIDATION_ERROR');
});
it('accepts a valid ISO cursor', () => {
  const ok = Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), id: 'x' })).toString('base64url');
  expect(decodeCursor(ok).id).toBe('x');
});
```

Run: `npm test -- cursor.util` → Expected: FAIL.

### Step 2: Assert parseability

```typescript
if (typeof c.createdAt !== 'string' || typeof c.id !== 'string') throw new Error('bad');
if (Number.isNaN(Date.parse(c.createdAt))) throw new Error('bad date');
return { createdAt: c.createdAt, id: c.id };
```

### Step 3: Tests → PASS, gate, commit

```bash
git add backend/src/shared/common/pagination/cursor.util.ts backend/src/shared/common/pagination/cursor.util.spec.ts
git commit -m "fix(pagination): validate cursor createdAt is a parseable date (L6)"
```

---

## Task 14: Documentation — stale comments + intended-behavior notes (L3, L7, L9)

**Findings:** L9 (stale comments), L3 (login confirms credentials for inactive accounts — *documented as intended*), L7 (`/join` auto-login while unverified — *documented as intended*).
**Requirement:** doc accuracy; D-1 / R4 trade-offs.

**Files (docs/comments only — no behavior change):**
- Modify: `backend/src/shared/database/schema/users.ts:23-25` (L9 — minor-login comment is stale; `family.enableChildLogin` implements it)
- Modify: `backend/src/modules/sharelinks/sharelink.util.ts:5` (L9 — no 23505 retry exists)
- Modify: `backend/src/modules/auth/auth.service.ts` (L3 — add a comment explaining the deliberate ordering)
- Modify: `backend/src/modules/sharelinks/join.service.ts:150-151` (L7 — add a comment referencing the verified-allowlist UX)
- Modify: `tasks/TASK-001/requirements-analyst-requirements.md` **or** `specs/architect-architecture.md` (add a short "Accepted trade-offs" note for L3 + L7)

### Step 1: Fix the stale `users.ts` comment (L9)

Replace lines 23-25:

```typescript
// Minor login (P-5): a constrained child User. Provisioning is implemented by
// FamilyRepository.enableChildLogin (FR-026); creation is gated behind the parent flow.
```

### Step 2: Fix the `sharelink.util.ts` comment (L9)

Replace the line-5 claim (there is no insert-time 23505 retry; collision probability is negligible):

```typescript
/** High-entropy shareable code. Uniqueness is backed by the `share_links_code_unique` index;
 *  the 12-char alphabet makes collisions negligible (no insert-time retry implemented). */
```

### Step 3: Document L3 as intended

In `auth.service.ts` `login`, above the status/verified checks, add:

```typescript
// D-1 (accepted trade-off): credentials are verified before the status/verified branches, so
// ACCOUNT_INACTIVE / EMAIL_NOT_VERIFIED imply valid credentials. Intentional for UX (clear
// remediation messaging); see specs "Accepted trade-offs". Throttling (5/min) bounds probing.
```

### Step 4: Document L7 as intended

In `join.service.ts` around the `registerNew` `issueSession` (line ~150):

```typescript
// R4 (accepted trade-off): a brand-new /join registrant is auto-logged-in while still
// unverified (verified-allowlist UX). If they log out, login blocks until they verify.
// Documented in specs "Accepted trade-offs".
```

### Step 5: Add the spec "Accepted trade-offs" note

Append to `specs/architect-architecture.md`:

```markdown
### Accepted trade-offs (Epic-01 code review TASK-002)
- **L3 — Login error specificity for inactive accounts:** password is verified before the
  active/verified checks, so an inactive/unverified account confirms credential validity.
  Accepted for clear remediation UX; mitigated by 5/min throttling.
- **L7 — /join auto-login while unverified:** new registrants get a session immediately
  (verified-allowlist UX) but must verify to log in again after logout. Accepted; revisit if
  the verified-allowlist is tightened.
```

### Step 6: Verify nothing changed behaviorally + commit

Run: `npm run build && npm run lint && npm test` (comments-only — all still green).

```bash
git add backend/src/shared/database/schema/users.ts backend/src/modules/sharelinks/sharelink.util.ts backend/src/modules/auth/auth.service.ts backend/src/modules/sharelinks/join.service.ts specs/architect-architecture.md
git commit -m "docs: fix stale comments + record L3/L7 accepted trade-offs (L3, L7, L9)"
```

---

## Final verification (before PR)

1. Full toolchain: `npm run build && npm run lint && npm test` — all green; suite count up by the new specs.
2. E2E (where Postgres two-role + Redis available): `npm run test:e2e` — including the new C1 (sanitized SVG round-trips clean), H2 (deactivated token rejected), and M5 (CORS-before-CSRF headers) assertions.
3. Migrations apply cleanly on a fresh DB: `npm run db:migrate && npm run db:rls && npm run db:seed`.
4. Run `verify` skill (Definition of Done) and `code-reviewer` on the diff.
5. Update the review file's status column (`[ ] open` → `[x] fixed`) in `tasks/TASK-001/code-reviewer-backend-review.md`, or note remediation in the PR description, so traceability is preserved.

---

## Notes on conventions honored

- **Layering:** all logic stays Controller → Service → Repository; no cross-layer leaks introduced.
- **Background jobs:** `OnModuleInit`/`OnModuleDestroy` + `setInterval`, config-flag gated, `running` re-entrancy guard, `SYSTEM_DRIZZLE` pool — identical to `OutboxRelay`. No new scheduler dependency.
- **Tests:** unit tests instantiate services directly with hand-built `jest.fn()` mocks and assert with `rejects.toMatchObject({ errorCode })` — matching the existing suites.
- **Migrations:** schema-first via `drizzle-kit generate`; RLS stays in the hand-applied `9999_rls_policies.sql` (untouched here).
- **DRY/YAGNI:** shared `UPLOAD_LIMITS` constant; SVG re-added safely rather than dropped; no speculative S3 code (only the `contentType` seam + documented contract).
