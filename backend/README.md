# Training Platform — Backend (Epic-01)

NestJS + Drizzle (PostgreSQL) backend for **TASK-001: User Management & Authentication**.
Layered Controller → Service → Repository. Multi-tenant via `trainerId`-discriminated tables +
Postgres Row-Level Security. JWT in httpOnly cookies (rotation + reuse-detection) + CSRF.

Specs: `../specs/architect-architecture.md` (design), `../specs/api-designer-spec.md` (contract),
`../tasks/TASK-001/writing-plans-plan.md` (implementation plan).

## Prerequisites

- Node ≥ 20, Docker (for Postgres + Redis).

## Quickstart

```bash
cp env.example .env            # adjust if needed (dev defaults work with docker-compose)
docker compose up -d db redis  # Postgres (with app/system roles) + Redis
npm install
npm run db:migrate             # apply schema (runs as the owner role)
npm run db:rls                 # apply Row-Level Security policies (NFR-011)
npm run db:seed                # super admin + demo trainer + a static join code
npm run start:dev              # http://localhost:3000  ·  Swagger: /api/docs
```

Seeded logins (dev): `admin@training.local / Admin1234` (SUPER_ADMIN), `trainer@training.local / Trainer1234` (TRAINER).

## Database roles (RLS)

Three Postgres roles (created by `docker/init-db.sql`):

| Role | Used by | RLS |
|------|---------|-----|
| `postgres` | migrations (`MIGRATION_DATABASE_URL`) — owns the tables | superuser |
| `app` | runtime app pool (`DATABASE_URL`) | **subject to RLS** (sees only the active tenant) |
| `system` | background jobs, Super Admin, registration (`SYSTEM_DATABASE_URL`) | **BYPASSRLS** |

The app tier MUST connect as a non-superuser (`app`) or `FORCE ROW LEVEL SECURITY` won't apply.
If you recreate the tables, re-run `npm run db:rls`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Watch-mode dev server |
| `npm run build` / `start:prod` | Compile to `dist/` / run it |
| `npm test` | Unit tests (mocked deps) |
| `npm run test:e2e` | E2E + RLS leakage tests (needs DB + Redis up) |
| `npm run lint` | ESLint (0 warnings) |
| `npm run db:generate` | Generate a migration from the schema |
| `npm run db:migrate` / `db:rls` / `db:seed` | Apply migrations / RLS / seed |

## Layout

```
src/
├── main.ts · app.module.ts · app.setup.ts
├── modules/   auth · users · profiles · context · sharelinks · family · availability · impersonation · branding
└── shared/    database(schema, drizzle) · tenancy · auth(guards, token, csrf) · common(errors, pagination)
              · mailer · storage · messaging(outbox) · audit · redis · config
test/          e2e + tenant-isolation (RLS) suites
drizzle/       generated migrations + 9999_rls_policies.sql
```

## Conventions

- All paths under `/api/v1`; UUID ids; tokens only in httpOnly cookies (never response bodies).
- State-changing requests need `X-CSRF-Token` (fetch one from `GET /auth/csrf`).
- Player/parent scoped requests need `X-Active-Context: <subjectProfileId>:<trainerId>`.
- Errors use a stable `errorCode` envelope (see `src/shared/common/errors/error-codes.ts`).
- Lists use keyset (cursor) pagination.

## Open items (carried from specs)

- Email template contents (Q-01.04) and a multi-node throttler/Redis store are MVP-deferred.
- Timed expiries (approval 48h, impersonation 1h) use lazy evaluation + the outbox sweep; a
  dedicated BullMQ scheduler is a future enhancement.
