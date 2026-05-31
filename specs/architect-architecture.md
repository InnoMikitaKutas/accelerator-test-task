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
| Auth tokens | **JWT** access + refresh, **rotation w/ reuse-detection** | Stateless app tier; impersonation token carries `admin_id`; active trainer context is **per-request, not a claim** (see Context Switching refinement). |
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

**Request context flow:** the client sends the active context per request as
`X-Active-Context: <subjectProfileId>:<trainerId>`; `TenantGuard` **authorizes it on every request**
(subject owned by the user; the `(subjectProfileId, trainerId)` association is active) → stores
`{ activeSubjectProfileId, activeTrainerId }` in `nestjs-cls` → scoped repos read `activeTrainerId`
and the DB GUC is set per transaction, while `activeSubjectProfileId` adds a subject-scope filter.
The **context switcher** (FR-019) changes only this per-request context — **not** a JWT claim; no
data merging ever occurs. *(Refined 2026-05-29; supersedes the earlier claim-based sketch — see the
Context Switching refinement at the end of this TASK-001 section.)*

### Auth & Session Model

- **Access JWT** (~15 min) + **refresh JWT** (config TTL; default 7d → Q-01.07), both httpOnly
  cookies. Refresh uses **rotation with reuse-detection**: refresh `jti` family tracked in
  Redis; replay of a rotated token revokes the whole family.
- **Claims:** `sub`, `role`, `emailVerified`, and for impersonation `impersonatorAdminId` +
  `impersonationExp`. **`activeTrainerId` is deliberately NOT a claim** — active context travels
  per-request (see the Context Switching refinement at the end of this TASK-001 section).
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
| Availability subject | Single `Availability` table, `subjectType ∈ {coach,player}` + `subjectId`, `CHECK` constraint. **Best Times = one shared schedule per child (keyed on `subjectId`, no `trainerId`)** per the 2026-05-29 brainstorm; ⚠️ revisit if client wants per-coach (would add `trainerId` + move Best Times to the per-context zone). Matches FR-030/FR-039. |
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

**Uploaded-asset serving contract (FR-037/§13).** User-uploaded assets (logos, photos) MUST be
served from a **cookieless origin** (prod: S3 + CDN) with `Content-Disposition: attachment` and
`X-Content-Type-Options: nosniff` so a malicious upload cannot execute in the app's origin. SVG is
additionally **sanitized at upload** with DOMPurify (`image.service.processLogo`), and every upload
is type-checked by **magic bytes** rather than the client-declared MIME (`storage/magic-bytes.ts`).
Epic-01 only *stores* assets (no `/static` route yet); the `LocalStorageAdapter` persists a
`.meta.json` content-type sidecar so the future static server / S3 adapter can honor this contract.

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
2. **~~"Separated views" context-switching~~ — RESOLVED (2026-05-29).** Designed in
   `tasks/TASK-001/brainstorming-separated-views-design.md` and folded into the Context Switching
   refinement below. Open sub-item: confirm Best Times scoping with client (per-child vs per-coach).
3. **Minor-login data model** (optional constrained child `User` vs profile-only) — confirm with
   product before building `family/` auth paths.
4. **Email template list** (Q-01.04) still client-owned; interface is ready, contents are not.
5. **Redis/BullMQ infra** assumed; if the team wants a single-node MVP, switch to the documented
   minimal alternative *before* implementation (changes throttler + scheduler tasks).

---

## [TASK-001] Context Switching & Separated Views — Refinement (2026-05-29)

Refines the **Auth & Session Model** and **Multi-Tenancy** sections above with the agreed design for
FR-019/FR-027 (multi-trainer separated views). Full UX + rationale live in
`tasks/TASK-001/brainstorming-separated-views-design.md` (not duplicated here). **This section is
authoritative** where it differs from the original same-day sketch.

**Context unit.** Active context = a `(subjectProfileId, trainerId)` pair, drawn from that profile's
*active* associations. BR-004 (M:N per profile) + BR-005 (no unified view) force two axes — one
cannot capture it. Switching reloads the scoped view; it is never a filter and never merges trainers.

**Three data zones** (define what the context scopes):

| Zone | Scoped by context? | Contains |
|------|--------------------|----------|
| Family / Account | ❌ global | parent contact info, children roster, associations, pending approvals, notifications, account settings |
| Per-subject | subject only | profile basics, skill level, **Best Times** |
| Per-context `(subject × trainer)` | ✅ full | dashboard, calendar/events, RSVPs, content (E04), tokens/purchases (E05), messages |

**Transport & enforcement — supersedes "context in the JWT claim".**
- Client sends `X-Active-Context: <subjectProfileId>:<trainerId>` on every scoped request.
- `TenantGuard` authorizes per request: (a) the subject is owned by the current user (own profile, or a
  child they parent); (b) the `(subjectProfileId, trainerId)` association exists and is active.
  Fail → `403 CONTEXT_FORBIDDEN`; association inactive → `410 CONTEXT_INACTIVE` (client bounces to a
  safe default).
- On pass: `{ activeSubjectProfileId, activeTrainerId }` → `nestjs-cls`. `activeTrainerId` drives the
  existing `ScopedRepository` + RLS GUC `app.current_trainer_id`; `activeSubjectProfileId` adds a
  subject-scope filter. **`activeTrainerId` is removed from JWT claims.**
- Rationale over the claim sketch: no token re-mint on switch; multi-tab (each tab carries its own
  context); refresh-rotation untouched.

**Persistence (FR-019).** Client remembers last context (localStorage); server stores a per-user
default-context preference to seed fresh logins.

**Guard chain.** No new guard — `TenantGuard` gains subject resolution/validation alongside trainer.
Order unchanged: `JwtAuthGuard → EmailVerifiedGuard → RolesGuard → TenantGuard → MinorAccountGuard`.

**Endpoints (contract owned by `api-designer`):**

| Endpoint / header | Purpose |
|-------------------|---------|
| `GET /me/contexts` | Switcher data: subjects → their active trainers, plus `defaultContext`. |
| `PUT /me/contexts/default` | Persist the user's default-context preference. |
| `X-Active-Context` header | Per-request active context, validated by `TenantGuard`. |

**Best Times scoping — DECISION + FLAG.** Best Times = **one shared schedule per child** (per-subject
zone; `Availability` stays keyed on `subjectId`, no `trainerId`). ⚠️ BR-007 ("independent Best-Times
per trainer") admits a per-coach reading — **confirm with client before building `availability/`**;
per-coach would add `trainerId` and move Best Times into the per-context zone.

**Cross-context notifications.** Approval/RSVP alerts surface in the global account zone,
channel-labeled, click-to-switch — compliant with BR-005 (an alert list is not a merged data view).

**Dependency.** The **minor-login model** (separate brainstorm) gates the child auth path and whether
a logged-in child sees only the per-context zone (no Family/Account zone, fixed subject).

---

## [TASK-001] Implementation-Plan Architecture Review (2026-05-29)

Reviews `tasks/TASK-001/writing-plans-plan.md` against this spec before implementation. **Bottom line: Phases 0–3 (scaffold, schema, shared-auth, Auth module) are sound and unblocked. Three HIGH risks must be resolved before the tenancy/parent/child phases they affect — all three are real (confirmed by the plan's own text), not hypothetical.** The layered structure, schema, DB-enforced invariants (partial-unique indexes for BR-003/BR-004), error envelope, token rotation, and transactional outbox are validated as correct.

### Locked-decision verdicts

| ID | Decision | Verdict | Note |
|----|----------|---------|------|
| **P-1** | `trainerId` = `trainer_profiles.id` | ✅ Sound | A trainer human now has **two** ids in the contract — `trainer_profiles.id` (tenant key, used by branding/sharelinks/associations/context/`UserListQueryDto.trainerId`) and `users.id` (impersonation). Document the canonical meaning at every `trainerId` field to prevent IDOR/confusion (R8). |
| **P-2** | ShareLink-mediated registration | ✅ Sound | Matches BR-002 + spec. But `POST /join/:code` (new-user branch) is a **public, session-creating** surface — needs CSRF handling + throttling (R6). |
| **P-3** | Cookie-only tokens | ✅ Sound | **Deployment constraint:** `SameSite=Strict` cookie auth requires the SPA and API to be **same-site** (same registrable domain / subdomains). Cross-domain split forces `SameSite=None;Secure`, weakening CSRF posture. Record as a deploy invariant. |
| **P-4** | Shared-per-child Best Times (no `trainerId` on `availability`) | ⚠️ Client-gated | Plan correctly defers build until client confirms (BR-007 admits per-coach). Note: `availability` has **no RLS backstop** (intentional — Zone-2/shared) → authorization is service-layer-only; a bug there leaks a child's schedule. Acceptable for low-sensitivity availability; keep the ownership/association gate airtight (R10). |
| **P-5** | Minor-login (constrained child `User`) | ❌ **Not ready** | Under-specified and internally inconsistent — see R3 (HIGH). |
| **P-6** | Local dev infra | ✅ Sound | Redis is present via `docker-compose`, so BullMQ delayed jobs work in dev. No conflict with the "adopt Redis day one" recommendation. |

### Risk register (prioritized)

#### HIGH — resolve before the affected phase

**R1 · RLS blocks non-request-scoped execution (system + Super Admin paths).** *(affects Tasks 1.9, 2.10, 2.15, 4.1, 8.4, 12.1)*
`FORCE ROW LEVEL SECURITY` (Task 1.9) subjects every role to the policies, and an unset `app.current_trainer_id` GUC fails **closed** (zero rows). But these paths run with **no** trainer GUC: the **outbox relay** and the **48h approval auto-deny job** (updates `child_purchase_approvals`, an RLS table), the **seed script** (inserts `share_links`), and **Super Admin `GET /users?trainerId=…`** (joins `trainer_player_associations`). All will silently no-op/return empty. The plan defers this to "see Phase 2.10," but Phase 2.10 only implements `runScoped(trainerId)` — there is no elevated path.
**Resolution:** introduce a **second DB role with `BYPASSRLS`** for system workers (outbox, scheduled expiry jobs, seed) and for Super Admin requests; expose it as a distinct pool/`SystemDb` provider used only by sanctioned services. Alternatively, jobs that target a single tenant `SET LOCAL app.current_trainer_id` per processed row. Decide and fold into Tasks 1.9 / 2.10 / 2.15.

**R2 · RLS single-key is too coarse for the account (Zone-1) zone.** *(affects Tasks 2.11, 6.1, 8.2–8.4; root-shared with R1)*
The context-switching design defines **Zone-1 (Family/Account) as global, spanning trainers** — yet its data lives in `trainer_player_associations` and `child_purchase_approvals`, which are RLS-keyed to a **single** `trainerId`. So `GET /me/contexts`, `GET /family`, `GET /family/approvals`, child↔trainer management, **and `TenantGuard`'s own context-resolution read** legitimately span trainers or run *before* a trainer is known. The plan calls these "sanctioned unscoped reads" (lines 1548, 1881) — but under FORCE RLS an unscoped read returns **zero rows**. The design is self-contradictory as written.
**Resolution:** make the policies **dual-axis**. Add a per-request GUC `app.current_user_id` (set in CLS by `JwtAuthGuard`, before `TenantGuard`), and extend each affected policy with an owning-user clause, e.g. for `trainer_player_associations`:
```sql
USING (
  trainer_id = current_setting('app.current_trainer_id', true)::uuid
  OR EXISTS (SELECT 1 FROM player_profiles p
             WHERE p.id = player_profile_id
               AND current_setting('app.current_user_id', true)::uuid IN (p.user_id, p.parent_user_id))
)
```
and for `child_purchase_approvals`: `OR parent_user_id = current_setting('app.current_user_id', true)::uuid`. This makes `TenantGuard`'s resolution read a *user-scoped* (RLS-allowed) read and unblocks all Zone-1 operations without bypass. Fold into Tasks 1.9 (policies), 2.1/2.8 (set `app.current_user_id`), 2.11 (resolution).

**R3 · Minor-login is half-specified (P-5).** *(affects Tasks 2.8, 2.11, 7.4, 8.1, 8.4)*
The whole child path assumes a child can authenticate: `MinorAccountGuard` reads `user.isMinor`, child sessions create purchase requests, and `POST /join` blocks a *logged-in* child. But **`createChild` (8.1) creates only a `PlayerProfile`** — no child `User`, and **no credential-provisioning endpoint exists in either spec** (how does a child get a password?). `JwtAuthGuard` even hardcodes `managedByParentUserId: null` (line 1438). So the minor actor is never created and the guard can't reliably gate on parentage.
**Resolution (product + arch):** decide child-login scope for MVP.
- *If in-MVP:* add child-`User` creation in `createChild` (or an explicit "enable login for this child" action) **and** a parent-driven credential issuance flow (parent sets/sends child password); load `isMinor`/`managedByParentUserId` into claims + principal.
- *If deferred:* stub `MinorAccountGuard`, drop the child-session branches of `POST /join` (7.4) and `purchase-requests` (8.4) from Epic-01 scope, and reconcile FR-025/026. Either way, stop the plan from half-building it.

#### MEDIUM

**R4 · `/join` auto-login vs `EmailVerifiedGuard`.** The spec logs a new registrant in (sets cookies) at `POST /join`, but `EmailVerifiedGuard` then blocks every subsequent request with `EMAIL_NOT_VERIFIED` (D-1/FR-003) → "logged in but can do nothing." Reconcile: either **don't auto-login** on register (issue verification, no session), or define an **unverified-allowed route allowlist** (`me`, `resend-verification`, `verify-email`, `logout`). Decide before Task 7.4.

**R5 · Refresh-rotation multi-tab race.** Cookies are shared across tabs; the design explicitly wants multi-tab. With one current-`jti` per family, two tabs hitting `/auth/refresh` near-simultaneously make the 2nd present an already-rotated `jti` → reuse-detection revokes the whole family → spurious logout. Add a short **grace window** (accept the immediately-previous `jti` for ~10s) or a per-family refresh lock. Fold into Task 2.5.

**R6 · CSRF + throttle on public `POST /join`.** The new-user branch has no prior session, so no `csrf` cookie exists to double-submit. Either **exempt** the unauthenticated register branch from CSRF or **seed a `csrf` cookie on `GET /join/:code`** resolve. Also throttle `/join` (NFR-004: 100 concurrent registrations + abuse). Fold into Tasks 2.7 / 7.5.

**R7 · Timed side-effects: pick one atomic pattern.** The plan mixes the **transactional outbox** (atomic with the DB tx) with **direct in-request BullMQ enqueue** for the 48h approval and 1h impersonation expiries (not atomic — a Redis blip after commit drops the expiry). Standardize: schedule timed jobs **via the outbox/a periodic `expiresAt` sweep**, or accept the gap with a reconciliation sweep. Fold into Tasks 2.15 / 8.4 / 10.1.

#### LOW (capture, fix opportunistically)

- **R8 · Identifier hygiene:** document `trainerId = trainer_profiles.id` at every contract field (see P-1).
- **R9 · Keyset indexes:** add composite `(created_at, id)` indexes on every listed table; the cursor must encode the **active sort key** (or restrict keyset to `createdAt` and use offset for `lastLoginAt` sort, which `UserListQueryDto` allows).
- **R10 · Profile reads:** `*_profiles` tables have no RLS — ensure every profile-by-id read passes an ownership/association gate (no backstop).
- **R11 · Search scaling:** `ILIKE '%term%'` can't use a btree index; fine at 10k (NFR-002), add `pg_trgm` for scale.
- **R12 · Logout token source:** read the refresh `family` from the `rt` cookie, not the access claim, so logout still revokes when the access token has expired.
- **FK integrity:** add `.references()` on `player_profiles.parent_user_id`, `users.managed_by_parent_user_id` (self-ref), and `trainer_player_associations.via_sharelink_id`.

### Decisions needed from product/client (gate specific phases)

1. **Minor login in MVP?** (R3) — gates Phases 7–8 child branches.
2. **Best Times shared-per-child vs per-coach?** (P-4) — gates Phase 9.
3. **`/join` auto-login UX** (R4) — gates Phase 7.4.
4. Confirm the 7 inferred email templates (Q-01.04) and refresh TTL (Q-01.07).

### What's unblocked now

Phases **0–3** (scaffold → schema → shared infra → Auth) can proceed immediately, with two cheap forward-edits folded in early: add the `app.current_user_id` CLS GUC (R2) when building `JwtAuthGuard`/`TenancyService`, and stand up the `BYPASSRLS` system DB role (R1) when building the Drizzle providers — both are far cheaper to include now than to retrofit. R3/R4/P-4 block only their specific later phases and need a product answer first.
