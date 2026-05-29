# Architecture

System design decisions. Read `MANIFEST.md` first. Requirements live in
`tasks/TASK-001/requirements-analyst-requirements.md` (FR/NFR/BR/entity IDs referenced
here, not duplicated).

---

## [TASK-001] User Management & Authentication (2026-05-29)

Foundation epic. Establishes the platform-wide architecture every later epic inherits:
persistence, auth/session model, multi-tenant isolation, file storage, email, audit, and
async processing.

### Tech Stack (decided)

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime / framework | **NestJS (Node + TypeScript)** | Layered Controller→Service→Repository; matches repo skills. |
| Database | **PostgreSQL** | M:N relations, field-level GDPR anonymization, transactions, partial indexes, **Row-Level Security**. |
| Data access | **Drizzle ORM** + `drizzle-kit` migrations | SQL-first, fully typed (user choice). *No first-class `@nestjs/typeorm` equivalent* → provided via a custom module (see Data Access). |
| Auth tokens | **JWT** access + refresh, **rotation w/ reuse-detection** | Stateless app tier; impersonation token carries `admin_id`; active trainer context in claims. |
| Token transport | **httpOnly + `SameSite` cookies + CSRF tokens** | Best XSS posture; directly satisfies FR-009 (CSRF). Double-submit cookie via `csrf-csrf`. |
| Password hashing | **argon2id** | NFR-006 (adaptive, industry standard). |
| File storage | **S3-compatible** (AWS S3; MinIO for dev) behind `StorageService`; **sharp** for thumbnails/resize | Scalable, cloud-portable, owns auto-resize for logos (US-01.14) + photo thumbnails (US-01.11). |
| Email | Provider-agnostic **`MailerService`** interface + 1 adapter (SES/SendGrid) + template registry | Swappable; resolves the abstraction part of Q-01.04 (template *list* still client-owned). |
| Shared state / cache | **Redis** | Distributed rate-limit store, refresh-token revocation list, branding cache, queue backend. *MVP-minimal alt below.* |
| Async / scheduled | **BullMQ** (delayed jobs) on Redis | Exact-time expiries: child-approval 48h auto-deny (BR-008), impersonation 1h (BR-009), token cleanup; async email + thumbnail gen. |
| Request context | **`nestjs-cls`** (AsyncLocalStorage) | Carries `currentUser`, `role`, `impersonatorAdminId`, **`activeTrainerContext`** without param-threading; feeds scoped repos + RLS GUC. |
| Validation | `class-validator` + `class-transformer`, global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) | Boundary validation (BR-013, AGENTS.md security). |
| Hardening | `helmet`, strict CORS, `@nestjs/throttler` (Redis) | NFR/§13: brute-force (FR-007), headers. |

**MVP-minimal alternative (single node, defer infra):** in-memory throttler + `@nestjs/schedule`
cron sweeps instead of Redis/BullMQ. Costs exact-timing precision (sweep granularity) and
breaks multi-node rate-limiting/token-revocation. **Recommend adopting Redis from day one** —
NFR-005 (1k concurrent) and refresh-rotation revocation effectively require shared state.

### Directory / Module Structure

```
src/
├── modules/
│   ├── auth/            # FR-001..009 — register, login, verify, reset, sessions
│   ├── users/           # FR-010..016 — Super Admin directory, create-trainer, soft/GDPR delete
│   ├── profiles/        # FR-038 — per-role profile edit, photo upload
│   ├── sharelinks/      # FR-017,018,028,033 — invites + trainer↔user associations
│   ├── family/          # FR-021..027 — child profiles, approvals, minor constraints
│   ├── availability/    # FR-030,031,034,039 — Best Times / My Times + conflict override
│   ├── impersonation/   # FR-015,016 — support impersonation + audit
│   └── branding/        # FR-037 — portal logo + color
├── shared/
│   ├── database/        # Drizzle provider (DRIZZLE token), schema barrel, migrations
│   ├── tenancy/         # TrainerContext, ScopedRepository base, RLS session helper, TenantGuard
│   ├── auth/            # Guards (Jwt, Roles, EmailVerified, Minor), decorators, cookie+csrf, token service
│   ├── audit/           # Generic AuditLog service + interceptor (consumed cross-module + Epic-07)
│   ├── mailer/          # MailerService interface + adapter + template registry
│   ├── storage/         # StorageService interface + S3 adapter + sharp pipeline
│   ├── messaging/       # Outbox + BullMQ queues (email, expiry jobs, cross-epic events)
│   ├── context/         # nestjs-cls setup (request context)
│   └── common/          # filters, interceptors, pipes, pagination (keyset), config
└── shared/integrations/ # s3, email-provider, redis clients
```

**Placement rules applied:** domain logic → `modules/<m>/`; cross-cutting infra → `shared/`;
external services → `shared/integrations/`. Dependency direction Controller→Service→Repository
only; repositories never call services.

### Multi-Tenancy — the central decision

**Model: single shared schema, association-scoped** (NOT schema- or DB-per-tenant).
*Forced* by FR-018/FR-019/BR-004/BR-005: a `PlayerProfile` associates with **multiple**
trainers simultaneously and Super Admin spans all tenants — per-tenant physical isolation
cannot represent this. Tenant ownership is a `trainerId` discriminator on tenant-owned tables.

**Drizzle has no global query filter**, so isolation is enforced in three layers:

1. **Primary — `ScopedRepository` pattern.** Tenant-owned tables are only queried through a
   scoped data-access helper that *requires* a resolved `TrainerContext` and always appends
   `where(eq(table.trainerId, ctx.trainerId))`. Direct unscoped access to those tables is
   disallowed by convention + lint rule.
2. **Backstop — Postgres Row-Level Security.** `RLS` policies on tenant-owned tables keyed to
   a per-transaction GUC `SET LOCAL app.current_trainer_id`. Even a forgotten predicate cannot
   leak rows. Super Admin uses a `BYPASSRLS` role / explicit elevated context.
3. **Verification — leakage tests.** Each tenant-owned table has an integration test asserting
   trainer A cannot read/write trainer B's rows. Directly serves the §2 "0% data leakage" metric.

**Request context flow:** `TenantGuard` resolves the active trainer (from JWT claim / context
switcher header) → stores in `nestjs-cls` → scoped repos read it and the DB GUC is set per
transaction. The **context switcher** (FR-019) just changes the active `trainerId` in the
claim/CLS; no data merging ever occurs.

### Auth & Session Model

- **Access JWT** (~15 min) + **refresh JWT** (config TTL; default 7d → Q-01.07), both httpOnly
  cookies. Refresh uses **rotation with reuse-detection**: refresh `jti` family tracked in
  Redis; replay of a rotated token revokes the whole family.
- **Claims:** `sub`, `role`, `emailVerified`, `activeTrainerId`, and for impersonation
  `impersonatorAdminId` + `impersonationExp`.
- **Guard chain:** `JwtAuthGuard` → `EmailVerifiedGuard` (D-1: blocks unverified, FR-003) →
  `RolesGuard` (FR-008) → `TenantGuard` (resolves/validates trainer context) →
  `MinorAccountGuard` (enforces the child CANNOT-matrix, FR-025).
- **Impersonation (FR-015):** issues a scoped token for the target user carrying
  `impersonatorAdminId`; super-admin target blocked (BR-009); 1h hard expiry via claim +
  BullMQ revoke job; every action attributed to the admin in `AuditLog`.
- **CSRF (FR-009):** double-submit cookie (`csrf-csrf`) on all state-changing routes.

### Entity Relationships (key decisions)

Full attribute list in requirements doc §Entities. Relationship/constraint choices:

| Relationship | Decision |
|--------------|----------|
| `User` → role profile | `User` 1–1 `TrainerProfile` **or** 1–1 `CoachProfile` **or** 1–N `PlayerProfile` (parent's self + children). Role selects the table(s). |
| Parent ↔ child | Child = `PlayerProfile{ isChild:true, parentUserId }` owned by the parent's `User`. Optional **minor login** = a separate constrained `User{ isMinor:true, managedByParentUserId }` linked to that profile. All minors parent-managed (BR-006/D-2). |
| Trainer ↔ player | `TrainerPlayerAssociation` **M:N between `TrainerProfile` and `PlayerProfile`** (per-profile, so parent and each child link independently). Carries `viaShareLinkId`, `status`. Core tenancy join. |
| Trainer ↔ coach | `TrainerCoachAssociation` with **partial unique index** `(coachProfileId) WHERE status='active'` → DB-enforces "one active trainer per coach" (BR-003/FR-029). |
| Availability subject | Single `Availability` table, `subjectType ∈ {coach,player}` + `subjectId`, `CHECK` constraint. Matches FR-030/FR-039. |
| Soft delete | `status`/`deletedAt` columns; queries filter non-deleted; history retained (BR-010). |
| GDPR delete | In-place anonymization of `User` PII + `UserDeletionLog` row; analytics rows keep FK, render "Deleted User" (BR-010/FR-014). |
| Tokens | `VerificationToken`/`PasswordResetToken`/refresh `jti` stored **hashed**, with `expiresAt`/`usedAt`. |

### Transaction Boundaries

| Operation | Boundary |
|-----------|----------|
| ShareLink registration (FR-017) | **1 tx:** create `User` + `PlayerProfile` + `TrainerPlayerAssociation` + increment ShareLink usage. |
| GDPR delete (FR-014) | **1 tx:** anonymize `User` + write `UserDeletionLog`. |
| Association removal (FR-023) | **1 tx:** soft-delete association + cascade child-with-trainer data; **RSVP cancellation is cross-epic** → emit via **outbox** (not in-tx with Epic-02). |
| Approval approve (FR-024) | Update approval in-tx; **Stripe charge is external** (Epic-05) → **saga/outbox**, never a DB tx spanning Stripe. |
| Single writes / reads | Implicit (direct scoped-repo call). |

**Cross-epic side effects** (RSVP cancel, payment charge, every email) use a transactional
**outbox** + BullMQ consumer — keeps DB transactions local and side effects reliable/retryable.

### Security (FR-009, NFR-006/007/008/011, §13)

- argon2id; refresh rotation + reuse-detection; httpOnly+SameSite cookies; CSRF double-submit.
- Guard chain above; `@nestjs/throttler` (Redis) on `/auth/*` (FR-007).
- Global `ValidationPipe` whitelist at every boundary (BR-013).
- Audit logging via interceptor + explicit calls for impersonation/deletion/override (NFR-008).
- Token expiries enforced by claim + BullMQ: verification 24h, reset 1h, impersonation 1h (NFR-007).
- RLS backstop + leakage tests for tenant isolation (NFR-011).
- Secrets only via env/config; never committed (AGENTS.md).

### Scalability (NFR-001..005)

- Stateless app nodes; Redis holds all shared state → horizontal scaling for 1k concurrent.
- **Indexes:** `users(email)` unique; `trainer_player_assoc(trainerId)`,`(playerProfileId)`;
  partial-unique active coach assoc; `sharelink(code)` unique; `availability(subjectType,subjectId,dayOfWeek)`;
  `child_approval(parentUserId,status,expiresAt)`.
- **Users list 10k <3s (NFR-002):** **keyset (cursor) pagination** preferred over offset; covered by indexes.
- **Caching:** per-trainer branding (read-heavy, rarely changes) in Redis; invalidate on update.
- **Async (BullMQ):** email, thumbnail generation, timed expiries → keep request paths <2s (NFR-001/004).
- `pg` pool + pgBouncer-ready for connection scaling.

### Data-Access (Drizzle) conventions

- Global `DrizzleModule` exposes a `DRIZZLE` injection token = `drizzle(pool, { schema })`.
- "Repository" layer = per-module data-access class injecting `DRIZZLE` + the module's schema
  slice; **tenant-owned tables only via `ScopedRepository`** (requires `TrainerContext`).
- Migrations: `drizzle-kit generate` → checked into repo → `migrate` on deploy.
- Relations via Drizzle `relations()`; complex M:N graphs via explicit joins.

### Open Architectural Risks → next phase

1. **Tenant-isolation enforcement is convention-driven** (Drizzle won't auto-scope). Mitigated by
   ScopedRepository + RLS + tests, but requires a lint rule banning raw access to tenant tables. **Highest risk.**
2. **"Separated views" context-switching** needs an explicit UX + data-scoping spec before
   frontend build (carried over from requirements gap).
3. **Minor-login data model** (optional constrained child `User` vs profile-only) — confirm with
   product before building `family/` auth paths.
4. **Email template list** (Q-01.04) still client-owned; interface is ready, contents are not.
5. **Redis/BullMQ infra** assumed; if the team wants a single-node MVP, switch to the documented
   minimal alternative *before* implementation (changes throttler + scheduler tasks).
