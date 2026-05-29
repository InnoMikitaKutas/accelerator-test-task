# Epic-01 User Management & Authentication — Backend Implementation Plan

**Task:** TASK-001

> **For Claude:** Use `using-git-worktrees` to create an isolated workspace, then implement with the `coder` skill. Work phase-by-phase, top to bottom — later phases assume earlier ones compile and pass. Commit after every task.

**Goal:** Build the complete NestJS + Drizzle backend for the foundation epic — multi-role auth (email/password, verification, reset, sessions), RBAC, multi-tenant isolation, parent–child families, ShareLink registration/associations, availability, impersonation, and portal branding — exposing the contract in `specs/api-designer-spec.md`.

**Architecture:** Layered NestJS (Controller → Service → Repository) on PostgreSQL via Drizzle ORM. Stateless app tier with JWT access+refresh in httpOnly cookies (rotation + reuse-detection), CSRF double-submit, argon2id hashing. Multi-tenancy = single shared schema discriminated by `trainerId`, enforced by a `ScopedRepository` + Postgres RLS backstop + leakage tests. Active context (`subjectProfileId:trainerId`) travels per-request via `X-Active-Context`, authorized by `TenantGuard` into `nestjs-cls` — never a JWT claim. Timed expiries and cross-epic side effects run on BullMQ/Redis + a transactional outbox. Full rationale: `specs/architect-architecture.md`; full contract: `specs/api-designer-spec.md`.

**Tech Stack:** NestJS 11 · TypeScript 5 · PostgreSQL 16 · Drizzle ORM + drizzle-kit · Redis + BullMQ · `nestjs-cls` · `class-validator`/`class-transformer` · `argon2` · `@nestjs/jwt` · `csrf-csrf` · `helmet` · `@nestjs/throttler` (+ Redis store) · `sharp` · S3 (MinIO dev) · Jest + Supertest.

---

## How to use this plan

- **Source of truth precedence** (AGENTS.md): Enforcement (hooks/CI) > Policy (AGENTS.md) > Architecture (`specs/`) > this plan. If this plan ever contradicts a spec, the spec wins — fix the plan.
- **DTOs are not duplicated here.** The API spec already contains every DTO verbatim. Each task says **"copy DTO from `specs/api-designer-spec.md` §… (lines …)"**. Paste it, add nothing the spec doesn't show.
- **Business rules** are referenced by ID (FR-/BR-/NFR-) → look them up in `tasks/TASK-001/requirements-analyst-requirements.md`.
- **TDD where logic lives** (services, guards, repositories): write the failing test first, implement, green, commit. Controllers/wiring: smoke-test via e2e at the end of each module.
- **Commit granularity:** one commit per task using the message in the task. Never `--no-verify` (AGENTS.md).
- **All backend code lives under `backend/`** (coder skill rule). There is no root `package.json`. Run all commands from inside `backend/`.

### Decisions locked for implementation (do not re-litigate)

| # | Decision | Where |
|---|----------|-------|
| P-1 | **`trainerId` everywhere = `trainer_profiles.id`** (the tenant key). Associations are profile↔profile; the RLS GUC `app.current_trainer_id` carries a `trainer_profiles.id`; `X-Active-Context` trainer half is a `trainer_profiles.id`. | this plan |
| P-2 | **No open `POST /auth/register`.** Registration is ShareLink-mediated at `POST /join/:code` (Module D). Trainers are created by Super Admin at `POST /users`. | api-spec §Module A note |
| P-3 | **Tokens only in httpOnly cookies** (`at`, `rt`, `csrf`). Response bodies never contain tokens. | api-spec global conventions |
| P-4 | **Best Times = one shared schedule per child** (`availability` has **no** `trainerId`). Flagged for client confirm — build shared-per-child. | brainstorm §9 / architecture |
| P-5 | **Children can log in** as constrained `User{ isMinor:true, managedByParentUserId }`. `MinorAccountGuard` enforces the CANNOT-matrix (FR-025). | architecture §Entity Relationships |
| P-6 | **Dev infra is local by default**: console mailer, local-disk storage, in-process Redis (docker-compose). Interfaces stay provider-agnostic so prod swaps to SES/S3 without touching callers. | this plan |

### Dependency graph (build order)

```
Phase 0  Scaffold & bootstrap
Phase 1  Database + Drizzle schema (ALL tables) + migrations + RLS
Phase 2  Shared infra: config · CLS · common/errors · pagination · token · password
         · cookie/CSRF · guards · tenancy(ScopedRepository, TenantGuard) · throttler
         · mailer · storage · messaging(outbox/BullMQ) · audit
            │
            ├─ Phase 3  Module A — Auth (login, verify, resend, reset, change, refresh, logout, me)
            ├─ Phase 4  Module B — Users / Super Admin (create-trainer, list, edit, deactivate, GDPR)
            ├─ Phase 5  Module C — Profiles (get/update own, photo upload)
            ├─ Phase 6  Context — GET /me/contexts, PUT /me/contexts/default
            ├─ Phase 7  Module D — ShareLinks & Associations (+ /join registration tx)   ← needs 4,5
            ├─ Phase 8  Module E — Family / Parent-Child (children, associations, approvals)
            ├─ Phase 9  Module F — Availability / Best Times (+ override)
            ├─ Phase 10 Module G — Impersonation (+ audit)
            └─ Phase 11 Module H — Portal Branding
Phase 12 Cross-cutting finalize: camp stub · seed/reference data · leakage tests · swagger polish · e2e suite · DoD
```

**Frontend is out of scope for this plan** — tracked separately in `specs/frontend-design-spec.md`.

---

## Phase 0 — Scaffold & Bootstrap

Goal: a NestJS app that boots, serves Swagger, and has lint/test/build wired — before any domain code.

### Task 0.1: Create the backend project skeleton

**Files (create):**
- `backend/package.json`
- `backend/tsconfig.json`, `backend/tsconfig.build.json`
- `backend/nest-cli.json`
- `backend/.eslintrc.cjs`, `backend/.prettierrc`
- `backend/jest.config.ts`
- `backend/.gitignore`
- `backend/.env.example`
- `backend/docker-compose.yml`

**Step 1 — `backend/package.json`:**

```jsonc
{
  "name": "training-platform-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\" --max-warnings 0",
    "format": "prettier --write \"src/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/swagger": "^11.0.0",
    "@nestjs/throttler": "^6.4.0",
    "@nestjs/bullmq": "^11.0.0",
    "@nest-lab/throttler-storage-redis": "^1.1.0",
    "argon2": "^0.41.1",
    "bullmq": "^5.34.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.7",
    "csrf-csrf": "^3.1.0",
    "drizzle-orm": "^0.38.0",
    "helmet": "^8.0.0",
    "ioredis": "^5.4.2",
    "nestjs-cls": "^5.4.0",
    "pg": "^8.13.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "sharp": "^0.33.5",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/cookie-parser": "^1.4.8",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "@types/pg": "^8.11.10",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "drizzle-kit": "^0.30.0",
    "eslint": "^9.17.0",
    "eslint-config-prettier": "^9.1.0",
    "jest": "^29.7.0",
    "prettier": "^3.4.2",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.7.2"
  }
}
```

**Step 2 — `backend/tsconfig.json`** (path aliases `@shared/*`, `@modules/*`):

```jsonc
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2023",
    "moduleResolution": "node",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@modules/*": ["src/modules/*"]
    }
  },
  "exclude": ["node_modules", "dist"]
}
```

**Step 3 — `backend/tsconfig.build.json`:**

```jsonc
{ "extends": "./tsconfig.json", "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"] }
```

**Step 4 — `backend/nest-cli.json`:**

```jsonc
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src", "compilerOptions": { "deleteOutDir": true } }
```

**Step 5 — `backend/jest.config.ts`** (maps the path aliases so unit tests resolve `@shared/*`):

```typescript
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
  },
};
export default config;
```

**Step 6 — `backend/.gitignore`:** `node_modules`, `dist`, `coverage`, `.env`, `*.log`, `uploads/`.

**Step 7 — `backend/.eslintrc.cjs`** (flat-config alternative acceptable): typescript-eslint recommended + `eslint-config-prettier`; **add the custom rule placeholder** for tenancy (Phase 2.10 references it):

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: 'tsconfig.json', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  root: true,
  env: { node: true, jest: true },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    // TENANCY GUARD (see Phase 2.10): forbid importing tenant-owned tables outside ScopedRepository.
    'no-restricted-imports': ['error', { patterns: [] }], // patterns filled in Task 2.10
  },
};
```

**Step 8 — `backend/.env.example`:**

```dotenv
NODE_ENV=development
PORT=3000
# Postgres
DATABASE_URL=postgres://app:app@localhost:5432/training
# Redis
REDIS_URL=redis://localhost:6379
# JWT (use openssl rand -base64 48 for real secrets; NEVER commit real values)
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
ACCESS_TOKEN_TTL=900            # 15 min (seconds)
REFRESH_TOKEN_TTL=604800        # 7 days  (Q-01.07 default)
# Cookies
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false             # true in prod (HTTPS)
CSRF_SECRET=dev-csrf-secret-change-me
# Storage (local disk in dev; s3 in prod)
STORAGE_DRIVER=local            # local | s3
STORAGE_LOCAL_DIR=./uploads
STORAGE_PUBLIC_BASE_URL=http://localhost:3000/static
# Mailer (console in dev)
MAILER_DRIVER=console           # console | ses | smtp
MAIL_FROM="Training Platform <no-reply@training.local>"
APP_BASE_URL=http://localhost:5173   # frontend origin, for links in emails
# Token lifetimes (seconds) — NFR-007
VERIFICATION_TOKEN_TTL=86400    # 24h
RESET_TOKEN_TTL=3600            # 1h
IMPERSONATION_TTL=3600          # 1h
APPROVAL_TTL=172800             # 48h
```

**Step 9 — `backend/docker-compose.yml`** (dev Postgres + Redis + MinIO):

```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: training }
    ports: ['5432:5432']
    volumes: ['pgdata:/var/lib/postgresql/data']
  redis:
    image: redis:7
    ports: ['6379:6379']
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment: { MINIO_ROOT_USER: minio, MINIO_ROOT_PASSWORD: minio123 }
    ports: ['9000:9000', '9001:9001']
    volumes: ['miniodata:/data']
volumes: { pgdata: {}, miniodata: {} }
```

**Verify:** `cd backend && npm install` completes with no peer-dep errors.

**Commit:** `chore(backend): scaffold NestJS project (deps, tsconfig, lint, jest, docker-compose)`

---

### Task 0.2: Minimal bootstrap that boots

**Files (create):** `backend/src/app.module.ts`, `backend/src/main.ts`

**Step 1 — minimal `app.module.ts`:**

```typescript
import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
```

**Step 2 — `main.ts`** (full bootstrap; expanded as modules land):

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({ origin: process.env.APP_BASE_URL?.split(','), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Global exception filter + ValidationPipe exceptionFactory wired in Phase 2.2.

  const config = new DocumentBuilder()
    .setTitle('Training Platform API')
    .setVersion('1')
    .addCookieAuth('at')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Active-Context' }, 'active-context')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

**Verify:** `npm run start:dev` boots; `GET http://localhost:3000/api/docs` serves Swagger UI (empty for now).

**Commit:** `chore(backend): bootstrap main.ts (versioning, helmet, validation, swagger)`

---

## Phase 1 — Database & Drizzle Schema

Goal: every table the epic needs, generated migrations, and the RLS backstop. Schema is split by domain under `src/shared/database/schema/` and re-exported from one barrel so the `DRIZZLE` provider gets the whole `schema` object.

> **Entity reference:** `requirements-analyst-requirements.md` §Entities Summary (lines 243–259) + architecture §Entity Relationships (lines 112–126). **P-1 applies: `trainerId` = `trainer_profiles.id`.**

### Task 1.1: Drizzle provider + module

**Files (create):** `src/shared/database/drizzle.module.ts`, `src/shared/database/drizzle.provider.ts`, `src/shared/database/drizzle.constants.ts`

**Step 1 — `drizzle.constants.ts`:**

```typescript
export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');
```

**Step 2 — `drizzle.provider.ts`:**

```typescript
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type DrizzleDB = NodePgDatabase<typeof schema>;
```

**Step 3 — `drizzle.module.ts`** (Global module; exposes `DRIZZLE` + `PG_POOL`):

```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { DRIZZLE, PG_POOL } from './drizzle.constants';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL'), max: 20 }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema, casing: 'snake_case' }),
    },
  ],
  exports: [DRIZZLE, PG_POOL],
})
export class DrizzleModule {}
```

**Commit:** `feat(db): add Drizzle provider + global module`

---

### Task 1.2: Enums

**File (create):** `src/shared/database/schema/enums.ts`

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'INACTIVE', 'DELETED']);
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']);
export const skillLevelEnum = pgEnum('skill_level', ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']); // Q-01.01 placeholder
export const shareLinkTypeEnum = pgEnum('sharelink_type', ['static', 'unique']);
export const shareLinkStatusEnum = pgEnum('sharelink_status', ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'ACTIVE']);
export const associationStatusEnum = pgEnum('association_status', ['active', 'inactive']);
export const paymentTypeEnum = pgEnum('payment_type', ['USD', 'TOKEN']);
export const approvalStatusEnum = pgEnum('approval_status', ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED']);
export const subjectTypeEnum = pgEnum('subject_type', ['player', 'coach']);
export const outboxStatusEnum = pgEnum('outbox_status', ['PENDING', 'SENT', 'FAILED']);
```

**Commit:** `feat(db): add schema enums`

---

### Task 1.3: Users + auth tokens

**Files (create):** `src/shared/database/schema/users.ts`, `src/shared/database/schema/tokens.ts`

**Step 1 — `users.ts`** (common identity fields live on `User`; role-specific on profiles):

```typescript
import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { roleEnum, userStatusEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: roleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    emailVerified: boolean('email_verified').notNull().default(false),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    // Minor login (P-5): a constrained child User.
    isMinor: boolean('is_minor').notNull().default(false),
    managedByParentUserId: uuid('managed_by_parent_user_id'),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    photoUrl: varchar('photo_url', { length: 1024 }),
    thumbnailUrl: varchar('thumbnail_url', { length: 1024 }),
    // Context-switch default seed (FR-019). subjectProfileId references player_profiles.id (nullable).
    defaultSubjectProfileId: uuid('default_subject_profile_id'),
    defaultTrainerId: uuid('default_trainer_id'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Email unique among non-deleted accounts (FR-002); GDPR anonymized emails differ so they don't collide.
    uniqueIndex('users_email_unique').on(t.email),
    index('users_role_status_idx').on(t.role, t.status),
    index('users_parent_idx').on(t.managedByParentUserId),
  ],
);
```

> **Note (FR-002 + GDPR):** A plain unique index on `email` is correct because GDPR anonymization rewrites the email to `deleted-user-<uuid>@anon.invalid` (architecture §Entity Relationships), so deleted rows never collide. Keep `citext` out for now (use lower-cased emails at the service boundary).

**Step 2 — `tokens.ts`** (verification + reset; **stored hashed**, architecture §Entity Relationships):

```typescript
import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_tokens_hash_idx').on(t.tokenHash)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reset_tokens_hash_idx').on(t.tokenHash)],
);
```

> Refresh-token `jti` families live in **Redis** (Phase 2.5), not a table.

**Commit:** `feat(db): add users + verification/reset token tables`

---

### Task 1.4: Profiles

**File (create):** `src/shared/database/schema/profiles.ts`

```typescript
import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { genderEnum, skillLevelEnum } from './enums';
import { users } from './users';

export const trainerProfiles = pgTable('trainer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  businessName: varchar('business_name', { length: 200 }).notNull(),
  businessAddress: varchar('business_address', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const coachProfiles = pgTable('coach_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  bio: text('bio'),
  credentials: text('credentials').array().notNull().default([]),
  certifications: text('certifications').array().notNull().default([]),
  publicVisible: boolean('public_visible').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// A parent User owns N player profiles (self + children) → userId is NOT unique here.
export const playerProfiles = pgTable(
  'player_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id), // owning account (parent or self)
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    isSelf: boolean('is_self').notNull().default(false),   // the account holder's own player profile (FR-020)
    isChild: boolean('is_child').notNull().default(false), // BR-006: all under-18 parent-managed
    parentUserId: uuid('parent_user_id'),                   // = userId for children; null for self
    age: integer('age'),                                    // 1..18 enforced in DTO/service for children
    gender: genderEnum('gender').notNull().default('UNSPECIFIED'),
    school: varchar('school', { length: 200 }),
    skillLevel: skillLevelEnum('skill_level'),              // read-only via API (FR-038)
    emergencyContactName: varchar('emergency_contact_name', { length: 120 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 32 }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete (BR-010)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('player_profiles_user_idx').on(t.userId), index('player_profiles_parent_idx').on(t.parentUserId)],
);
```

**Commit:** `feat(db): add trainer/coach/player profile tables`

---

### Task 1.5: Associations + ShareLinks (tenant-owned)

**Files (create):** `src/shared/database/schema/associations.ts`, `src/shared/database/schema/sharelinks.ts`

**Step 1 — `associations.ts`** (note the partial-unique indexes that enforce BR-003/BR-004):

```typescript
import { sql } from 'drizzle-orm';
import { pgTable, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { associationStatusEnum } from './enums';
import { trainerProfiles, coachProfiles, playerProfiles } from './profiles';

export const trainerPlayerAssociations = pgTable(
  'trainer_player_associations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainerId: uuid('trainer_id').notNull().references(() => trainerProfiles.id), // TENANT KEY (P-1)
    playerProfileId: uuid('player_profile_id').notNull().references(() => playerProfiles.id),
    viaShareLinkId: uuid('via_sharelink_id'),
    status: associationStatusEnum('status').notNull().default('active'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('tpa_trainer_idx').on(t.trainerId),
    index('tpa_player_idx').on(t.playerProfileId),
    // One active link per (trainer, player) — BR-004 dedupe.
    uniqueIndex('tpa_active_unique').on(t.trainerId, t.playerProfileId).where(sql`status = 'active'`),
  ],
);

export const trainerCoachAssociations = pgTable(
  'trainer_coach_associations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainerId: uuid('trainer_id').notNull().references(() => trainerProfiles.id), // TENANT KEY
    coachProfileId: uuid('coach_profile_id').notNull().references(() => coachProfiles.id),
    status: associationStatusEnum('status').notNull().default('active'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('tca_trainer_idx').on(t.trainerId),
    // BR-003/FR-029: exactly ONE active trainer per coach — DB-enforced.
    uniqueIndex('tca_one_active_trainer_per_coach').on(t.coachProfileId).where(sql`status = 'active'`),
  ],
);
```

**Step 2 — `sharelinks.ts`:**

```typescript
import { pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { shareLinkTypeEnum, shareLinkStatusEnum } from './enums';
import { trainerProfiles } from './profiles';
import { users } from './users';

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 32 }).notNull(),
    type: shareLinkTypeEnum('type').notNull(),
    trainerId: uuid('trainer_id').notNull().references(() => trainerProfiles.id), // TENANT KEY
    createdBy: uuid('created_by').notNull().references(() => users.id),
    targetEmail: varchar('target_email', { length: 255 }), // coach invites only
    label: varchar('label', { length: 120 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // null = no expiry (static)
    maxUses: integer('max_uses'),                                // null = unlimited (static); 1 = unique
    useCount: integer('use_count').notNull().default(0),
    status: shareLinkStatusEnum('status').notNull().default('ACTIVE'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('share_links_code_unique').on(t.code), index('share_links_trainer_idx').on(t.trainerId)],
);
```

**Commit:** `feat(db): add associations + sharelinks tables (BR-003/BR-004 partial-unique)`

---

### Task 1.6: Family, Availability, Audit, Branding, Outbox

**Files (create):** `family.ts`, `availability.ts`, `audit.ts`, `branding.ts`, `outbox.ts` under `schema/`.

**`family.ts`:**

```typescript
import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { paymentTypeEnum, approvalStatusEnum } from './enums';
import { playerProfiles } from './profiles';
import { trainerProfiles } from './profiles';
import { users } from './users';

export const childPurchaseApprovals = pgTable(
  'child_purchase_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    childProfileId: uuid('child_profile_id').notNull().references(() => playerProfiles.id),
    parentUserId: uuid('parent_user_id').notNull().references(() => users.id),
    trainerId: uuid('trainer_id').notNull().references(() => trainerProfiles.id), // TENANT KEY
    itemRef: varchar('item_ref', { length: 120 }).notNull(),
    paymentType: paymentTypeEnum('payment_type').notNull(),
    amount: integer('amount'), // minor units; required when USD
    status: approvalStatusEnum('status').notNull().default('PENDING'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // +48h (BR-008)
    childNote: varchar('child_note', { length: 280 }),
    parentNote: varchar('parent_note', { length: 280 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('approvals_parent_status_exp_idx').on(t.parentUserId, t.status, t.expiresAt)],
);

export const childTokenSettings = pgTable('child_token_settings', {
  childProfileId: uuid('child_profile_id').primaryKey().references(() => playerProfiles.id),
  allowTokenWithoutApproval: boolean('allow_token_without_approval').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**`availability.ts`** (P-4: NO `trainerId` — shared-per-subject):

```typescript
import { pgTable, uuid, integer, boolean, time, timestamp, varchar, index } from 'drizzle-orm/pg-core';
import { subjectTypeEnum } from './enums';
import { coachProfiles, trainerProfiles } from './profiles';
import { users } from './users';

export const availability = pgTable(
  'availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: subjectTypeEnum('subject_type').notNull(), // 'player' | 'coach'
    subjectId: uuid('subject_id').notNull(),                // player_profiles.id OR coach_profiles.id
    dayOfWeek: integer('day_of_week').notNull(),            // 0=Sun..6=Sat
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    available: boolean('available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('availability_subject_idx').on(t.subjectType, t.subjectId, t.dayOfWeek)],
);

export const availabilityOverrides = pgTable('availability_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull(),          // Epic-02 owns event linkage
  coachId: uuid('coach_id').notNull().references(() => coachProfiles.id),
  trainerId: uuid('trainer_id').notNull().references(() => trainerProfiles.id), // TENANT KEY
  overriddenBy: uuid('overridden_by').notNull().references(() => users.id),
  reason: varchar('reason', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**`audit.ts`:**

```typescript
import { pgTable, uuid, varchar, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id'),
  impersonatorAdminId: uuid('impersonator_admin_id'), // set when action performed under impersonation
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  ip: varchar('ip', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const impersonationLogs = pgTable(
  'impersonation_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id').notNull().references(() => users.id),
    targetUserId: uuid('target_user_id').notNull().references(() => users.id),
    reason: varchar('reason', { length: 500 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSec: integer('duration_sec'),
  },
  (t) => [index('imp_admin_idx').on(t.adminId), index('imp_target_idx').on(t.targetUserId), index('imp_started_idx').on(t.startedAt)],
);

export const userDeletionLogs = pgTable('user_deletion_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalUserId: uuid('original_user_id').notNull(),
  originalEmail: varchar('original_email', { length: 255 }).notNull(),
  deletedBy: uuid('deleted_by').notNull().references(() => users.id),
  reason: varchar('reason', { length: 500 }).notNull(),
  backupRef: varchar('backup_ref', { length: 255 }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**`branding.ts`:**

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { trainerProfiles } from './profiles';

export const trainerBranding = pgTable('trainer_branding', {
  trainerId: uuid('trainer_id').primaryKey().references(() => trainerProfiles.id), // TENANT KEY
  logoUrl: varchar('logo_url', { length: 1024 }),
  primaryColorHex: varchar('primary_color_hex', { length: 7 }).notNull().default('#1A73E8'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**`outbox.ts`** (transactional outbox — architecture §Cross-epic side effects):

```typescript
import { pgTable, uuid, varchar, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { outboxStatusEnum } from './enums';

export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 100 }).notNull(), // e.g. 'email.verification', 'rsvp.cancel'
    payload: jsonb('payload').notNull(),
    status: outboxStatusEnum('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('outbox_status_idx').on(t.status, t.availableAt)],
);
```

**Commit:** `feat(db): add family/availability/audit/branding/outbox tables`

---

### Task 1.7: Schema barrel + relations

**File (create):** `src/shared/database/schema/index.ts`

```typescript
export * from './enums';
export * from './users';
export * from './tokens';
export * from './profiles';
export * from './associations';
export * from './sharelinks';
export * from './family';
export * from './availability';
export * from './audit';
export * from './branding';
export * from './outbox';

// Drizzle relations() for the common joins (parent→children, user→profiles, assoc graphs).
import { relations } from 'drizzle-orm';
import { users } from './users';
import { trainerProfiles, coachProfiles, playerProfiles } from './profiles';
import { trainerPlayerAssociations, trainerCoachAssociations } from './associations';

export const usersRelations = relations(users, ({ many, one }) => ({
  playerProfiles: many(playerProfiles),
  trainerProfile: one(trainerProfiles),
  coachProfile: one(coachProfiles),
}));

export const playerProfilesRelations = relations(playerProfiles, ({ one, many }) => ({
  owner: one(users, { fields: [playerProfiles.userId], references: [users.id] }),
  associations: many(trainerPlayerAssociations),
}));

export const trainerPlayerAssocRelations = relations(trainerPlayerAssociations, ({ one }) => ({
  trainer: one(trainerProfiles, { fields: [trainerPlayerAssociations.trainerId], references: [trainerProfiles.id] }),
  player: one(playerProfiles, { fields: [trainerPlayerAssociations.playerProfileId], references: [playerProfiles.id] }),
}));
// Add coach relations analogously if join-heavy queries need them.
```

**Commit:** `feat(db): add schema barrel + relations`

---

### Task 1.8: drizzle-kit config + generate initial migration

**File (create):** `backend/drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/shared/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

**Steps:**
1. `docker compose up -d db redis` (Postgres + Redis).
2. `npm run db:generate` → emits `drizzle/0000_*.sql`.
3. Inspect the SQL — confirm all enums, tables, partial-unique indexes (`tpa_active_unique`, `tca_one_active_trainer_per_coach`) are present.
4. `npm run db:migrate` → applies to dev DB.

**Verify:** `psql $DATABASE_URL -c '\dt'` lists all 15+ tables; `\di` shows the partial-unique indexes.

**Commit:** `feat(db): drizzle-kit config + initial migration`

---

### Task 1.9: Row-Level Security backstop (NFR-011)

**File (create, hand-written SQL):** `backend/drizzle/9999_rls_policies.sql` (named to run after generated migrations; or fold into a custom migration step).

> The GUC `app.current_trainer_id` is set per-transaction by the `ScopedRepository` (Phase 2.10). RLS is the **backstop** — even a forgotten `where` cannot leak rows. `availability` is **excluded** (no `trainerId`, shared-per-subject, P-4).

```sql
-- Enable RLS + policy on each tenant-owned table keyed to app.current_trainer_id.
-- Pattern repeated per table:
ALTER TABLE trainer_player_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tpa_tenant_isolation ON trainer_player_associations
  USING (trainer_id = current_setting('app.current_trainer_id', true)::uuid);

ALTER TABLE trainer_coach_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tca_tenant_isolation ON trainer_coach_associations
  USING (trainer_id = current_setting('app.current_trainer_id', true)::uuid);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY sl_tenant_isolation ON share_links
  USING (trainer_id = current_setting('app.current_trainer_id', true)::uuid);

ALTER TABLE child_purchase_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY cpa_tenant_isolation ON child_purchase_approvals
  USING (trainer_id = current_setting('app.current_trainer_id', true)::uuid);

ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY ao_tenant_isolation ON availability_overrides
  USING (trainer_id = current_setting('app.current_trainer_id', true)::uuid);

ALTER TABLE trainer_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY tb_tenant_isolation ON trainer_branding
  USING (trainer_id = current_setting('app.current_trainer_id', true)::uuid);

-- Super Admin path bypasses RLS via an elevated DB role or a session flag; see Phase 2.10.
-- The app's normal DB role must NOT be a table owner / BYPASSRLS (owners skip RLS by default).
-- Create a non-owner role for the pool, or FORCE RLS:
ALTER TABLE trainer_player_associations FORCE ROW LEVEL SECURITY;
ALTER TABLE trainer_coach_associations  FORCE ROW LEVEL SECURITY;
ALTER TABLE share_links                  FORCE ROW LEVEL SECURITY;
ALTER TABLE child_purchase_approvals     FORCE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides       FORCE ROW LEVEL SECURITY;
ALTER TABLE trainer_branding             FORCE ROW LEVEL SECURITY;
```

**Steps:**
1. Apply via `psql $DATABASE_URL -f drizzle/9999_rls_policies.sql` (or wire a `migrate` post-step).
2. Document in `backend/README.md` that RLS must be re-applied if tables are recreated.

**Verify:** With `app.current_trainer_id` unset, `SELECT * FROM share_links` returns 0 rows under FORCE RLS for the app role; with it set, only that tenant's rows return. (Full leakage tests in Phase 12.)

**Commit:** `feat(db): add Postgres RLS policies for tenant-owned tables (NFR-011)`

---

## Phase 2 — Shared Infrastructure

Goal: every cross-cutting building block the modules depend on. **Build and unit-test these before any module.** Order matters: 2.1→2.11 are the request pipeline (context, errors, auth, tenancy); 2.12→2.16 are services (throttle, mail, storage, messaging, audit).

> Maps to architecture §Directory/Module Structure (`src/shared/...`) and §Auth/Session + §Multi-Tenancy.

### Task 2.1: Request context (CLS)

**Files (create):** `src/shared/context/request-context.ts`, `src/shared/context/cls.config.ts`

```typescript
// request-context.ts — the typed shape stored in nestjs-cls per request.
import { Role } from '@shared/database/schema'; // re-export Role type from enums (see note)

export interface SessionPrincipal {
  id: string;
  role: Role;
  email: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  isMinor: boolean;
  managedByParentUserId: string | null;
}

export interface RequestContextShape {
  user?: SessionPrincipal;
  impersonatorAdminId?: string;   // present while a Super Admin impersonates (FR-015)
  activeSubjectProfileId?: string; // from X-Active-Context (TenantGuard)
  activeTrainerId?: string;        // from X-Active-Context → drives ScopedRepository + RLS GUC
  ip?: string;
}

export const CTX_KEYS = {
  user: 'user',
  impersonatorAdminId: 'impersonatorAdminId',
  activeSubjectProfileId: 'activeSubjectProfileId',
  activeTrainerId: 'activeTrainerId',
  ip: 'ip',
} as const;
```

> **Role type:** export a `Role` union from `enums.ts`: `export type Role = (typeof roleEnum.enumValues)[number];`. Add it in Task 1.2 if not already present.

`cls.config.ts` registers `ClsModule.forRoot({ global: true, middleware: { mount: true, setup: (cls, req) => cls.set('ip', req.ip) } })`. Import into `AppModule`.

**Commit:** `feat(shared): add nestjs-cls request context`

---

### Task 2.2: Error envelope + global exception filter

**Files (create):** `src/shared/common/errors/error-codes.ts`, `app.exception.ts`, `all-exceptions.filter.ts`, `dto/error-response.dto.ts`, `validation-exception.factory.ts`

> Implements the **stable `errorCode` envelope** and full **error-code catalog** from api-spec §Standard error envelope (lines 58–104) and `ErrorResponseDto` (lines 1012–1022). Clients branch on `errorCode`, never `message`.

**Step 1 — `error-codes.ts`** (catalog → HTTP status + default message). Copy every code from api-spec lines 77–104:

```typescript
import { HttpStatus } from '@nestjs/common';

export enum AppErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  FORCE_PASSWORD_CHANGE = 'FORCE_PASSWORD_CHANGE',
  FORBIDDEN_ROLE = 'FORBIDDEN_ROLE',
  CSRF_INVALID = 'CSRF_INVALID',
  CONTEXT_FORBIDDEN = 'CONTEXT_FORBIDDEN',
  TENANT_FORBIDDEN = 'TENANT_FORBIDDEN',
  MINOR_FORBIDDEN = 'MINOR_FORBIDDEN',
  IMPERSONATE_SUPER_ADMIN = 'IMPERSONATE_SUPER_ADMIN',
  NOT_FOUND = 'NOT_FOUND',
  EMAIL_EXISTS = 'EMAIL_EXISTS',
  COACH_ALREADY_ASSIGNED = 'COACH_ALREADY_ASSIGNED',
  DUPLICATE_CHILD_WARNING = 'DUPLICATE_CHILD_WARNING',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_USED = 'TOKEN_USED',
  SHARELINK_EXPIRED = 'SHARELINK_EXPIRED',
  SHARELINK_USED = 'SHARELINK_USED',
  CONTEXT_INACTIVE = 'CONTEXT_INACTIVE',
  APPROVAL_EXPIRED = 'APPROVAL_EXPIRED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  RATE_LIMITED = 'RATE_LIMITED',
}

export const ERROR_META: Record<AppErrorCode, { status: HttpStatus; message: string }> = {
  [AppErrorCode.VALIDATION_ERROR]: { status: HttpStatus.BAD_REQUEST, message: 'Validation failed.' },
  [AppErrorCode.INVALID_CREDENTIALS]: { status: HttpStatus.UNAUTHORIZED, message: 'Invalid email or password.' },
  [AppErrorCode.UNAUTHENTICATED]: { status: HttpStatus.UNAUTHORIZED, message: 'Authentication required.' },
  [AppErrorCode.EMAIL_NOT_VERIFIED]: { status: HttpStatus.FORBIDDEN, message: 'Please verify your email before logging in.' },
  [AppErrorCode.ACCOUNT_INACTIVE]: { status: HttpStatus.FORBIDDEN, message: 'This account is inactive.' },
  [AppErrorCode.FORCE_PASSWORD_CHANGE]: { status: HttpStatus.FORBIDDEN, message: 'You must change your password before continuing.' },
  [AppErrorCode.FORBIDDEN_ROLE]: { status: HttpStatus.FORBIDDEN, message: 'You do not have permission to perform this action.' },
  [AppErrorCode.CSRF_INVALID]: { status: HttpStatus.FORBIDDEN, message: 'Invalid or missing CSRF token.' },
  [AppErrorCode.CONTEXT_FORBIDDEN]: { status: HttpStatus.FORBIDDEN, message: 'You are not entitled to this context.' },
  [AppErrorCode.TENANT_FORBIDDEN]: { status: HttpStatus.FORBIDDEN, message: 'Cross-tenant access denied.' },
  [AppErrorCode.MINOR_FORBIDDEN]: { status: HttpStatus.FORBIDDEN, message: 'This action is not permitted for child accounts.' },
  [AppErrorCode.IMPERSONATE_SUPER_ADMIN]: { status: HttpStatus.FORBIDDEN, message: 'Super Admins cannot be impersonated.' },
  [AppErrorCode.NOT_FOUND]: { status: HttpStatus.NOT_FOUND, message: 'Resource not found.' },
  [AppErrorCode.EMAIL_EXISTS]: { status: HttpStatus.CONFLICT, message: 'An account with this email already exists.' },
  [AppErrorCode.COACH_ALREADY_ASSIGNED]: { status: HttpStatus.CONFLICT, message: 'This coach is already active under another trainer.' },
  [AppErrorCode.DUPLICATE_CHILD_WARNING]: { status: HttpStatus.CONFLICT, message: 'A child with the same name and age already exists.' },
  [AppErrorCode.TOKEN_INVALID]: { status: HttpStatus.GONE, message: 'This link is invalid.' },
  [AppErrorCode.TOKEN_EXPIRED]: { status: HttpStatus.GONE, message: 'This link has expired.' },
  [AppErrorCode.TOKEN_USED]: { status: HttpStatus.GONE, message: 'This link has already been used.' },
  [AppErrorCode.SHARELINK_EXPIRED]: { status: HttpStatus.GONE, message: 'This invite link has expired.' },
  [AppErrorCode.SHARELINK_USED]: { status: HttpStatus.GONE, message: 'This invite link has already been used.' },
  [AppErrorCode.CONTEXT_INACTIVE]: { status: HttpStatus.GONE, message: 'That connection is no longer active.' },
  [AppErrorCode.APPROVAL_EXPIRED]: { status: HttpStatus.GONE, message: 'This approval request has expired.' },
  [AppErrorCode.FILE_TOO_LARGE]: { status: HttpStatus.PAYLOAD_TOO_LARGE, message: 'File exceeds the 2 MB limit.' },
  [AppErrorCode.UNSUPPORTED_FILE_TYPE]: { status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, message: 'Unsupported file type.' },
  [AppErrorCode.RATE_LIMITED]: { status: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests. Please try again later.' },
};
```

**Step 2 — `app.exception.ts`:**

```typescript
import { HttpException } from '@nestjs/common';
import { AppErrorCode, ERROR_META } from './error-codes';

export interface FieldError { field: string; message: string; }

export class AppException extends HttpException {
  constructor(
    public readonly errorCode: AppErrorCode,
    options?: { message?: string; details?: FieldError[]; extra?: Record<string, unknown> },
  ) {
    const meta = ERROR_META[errorCode];
    super(
      {
        statusCode: meta.status,
        errorCode,
        message: options?.message ?? meta.message,
        details: options?.details,
        ...options?.extra, // e.g. { canResend: true } for EMAIL_NOT_VERIFIED
      },
      meta.status,
    );
  }
}
```

**Step 3 — `all-exceptions.filter.ts`** (registered globally; normalizes everything to the envelope):

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppException) {
      const body = exception.getResponse() as Record<string, unknown>;
      return res.status(exception.getStatus()).json({ error: HttpStatus[exception.getStatus()], ...body });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse();
      const message = typeof r === 'string' ? r : (r as { message?: string }).message ?? exception.message;
      return res.status(status).json({ statusCode: status, error: HttpStatus[status], errorCode: 'HTTP_ERROR', message });
    }
    this.logger.error(exception);
    return res.status(500).json({ statusCode: 500, error: 'Internal Server Error', errorCode: 'INTERNAL_ERROR', message: 'Unexpected error.' });
  }
}
```

**Step 4 — `validation-exception.factory.ts`** (turns `class-validator` errors into `VALIDATION_ERROR` + `details[]`):

```typescript
import { ValidationError } from '@nestjs/common';
import { AppException } from './app.exception';
import { AppErrorCode } from './error-codes';

export function validationExceptionFactory(errors: ValidationError[]): AppException {
  const details = errors.flatMap((e) =>
    Object.values(e.constraints ?? {}).map((message) => ({ field: e.property, message })),
  );
  return new AppException(AppErrorCode.VALIDATION_ERROR, { details });
}
```

**Step 5 — wire into `main.ts`:** pass `{ exceptionFactory: validationExceptionFactory }` into `ValidationPipe`; `app.useGlobalFilters(new AllExceptionsFilter())`.

**Step 6 — `error-response.dto.ts`:** copy `ErrorResponseDto` from api-spec lines 1012–1022 (used in `@ApiResponse({ type: ErrorResponseDto })`).

**Test (`error-codes.spec.ts`):** assert `ERROR_META` has an entry for every `AppErrorCode` member (no missing mappings) and statuses match the catalog.

**Commit:** `feat(shared): add error-code envelope + global exception filter + validation factory`

---

### Task 2.3: Keyset pagination

**Files (create):** `src/shared/common/pagination/keyset-query.dto.ts`, `paginated-response.dto.ts`, `cursor.util.ts`

> Implements api-spec §Pagination (lines 106–134). Opaque base64 cursor over `(createdAt, id)`.

```typescript
// cursor.util.ts
export interface Cursor { createdAt: string; id: string; }
export const encodeCursor = (c: Cursor): string => Buffer.from(JSON.stringify(c)).toString('base64url');
export function decodeCursor(s: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (typeof c.createdAt !== 'string' || typeof c.id !== 'string') throw new Error();
    return c;
  } catch {
    // bad cursor → treat as VALIDATION_ERROR at the controller boundary
    throw new Error('INVALID_CURSOR');
  }
}
```

- `keyset-query.dto.ts`: copy `KeysetQueryDto` from api-spec lines 124–134.
- `paginated-response.dto.ts`: copy `PaginatedResponseDto<T>` shape from api-spec lines 113–120 (generic; use a `Paginated<T>()` mixin for Swagger `@ApiOkResponse`).

**Helper for repositories:** a `keysetPage(rows, limit)` that, given `limit+1` fetched rows, returns `{ items: rows.slice(0,limit), nextCursor, hasMore }`. Provide it in `cursor.util.ts`.

**Test:** round-trip `encodeCursor`/`decodeCursor`; `keysetPage` computes `hasMore` and trims correctly.

**Commit:** `feat(shared): add keyset pagination helpers + DTOs`

---

### Task 2.4: Common decorators

**File (create):** `src/shared/common/decorators/index.ts`

```typescript
import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@shared/database/schema';
import type { SessionPrincipal } from '@shared/context/request-context';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const REQUIRE_CONTEXT = 'requireContext';
export const RequireContext = () => SetMetadata(REQUIRE_CONTEXT, true);

export const ALLOW_FORCED_CHANGE = 'allowForcedChange';
export const AllowDuringForcedChange = () => SetMetadata(ALLOW_FORCED_CHANGE, true);

// Reads request.user (populated by JwtAuthGuard).
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): SessionPrincipal =>
  ctx.switchToHttp().getRequest().user,
);
```

**Commit:** `feat(shared): add Public/Roles/RequireContext/CurrentUser decorators`

---

### Task 2.5: Redis provider + Token service (JWT rotation + reuse-detection)

**Files (create):** `src/shared/redis/redis.module.ts`, `redis.constants.ts`, `src/shared/auth/token.service.ts`

> Architecture §Auth: access ~15 min + refresh (7d default) cookies; refresh **rotation with reuse-detection** — `jti` family tracked in Redis; replay revokes the whole family.

**Step 1 — Redis provider** (`REDIS` token = `new Redis(REDIS_URL)`), global module exporting `REDIS`.

**Step 2 — `token.service.ts`:**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '@shared/redis/redis.constants';
import type { Role } from '@shared/database/schema';

export interface AccessClaims {
  sub: string; role: Role; emailVerified: boolean; mustChangePassword: boolean; isMinor: boolean;
  impersonatorAdminId?: string; impersonationExp?: number;
}
interface RefreshClaims { sub: string; jti: string; family: string; }

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async issueSession(claims: AccessClaims): Promise<{ accessToken: string; refreshToken: string }> {
    const family = randomUUID();
    const accessToken = await this.signAccess(claims);
    const refreshToken = await this.signRefresh(claims.sub, family);
    return { accessToken, refreshToken };
  }

  signAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: Number(this.config.get('ACCESS_TOKEN_TTL', 900)),
    });
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAsync<AccessClaims>(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
  }

  private async signRefresh(sub: string, family: string): Promise<string> {
    const jti = randomUUID();
    const ttl = Number(this.config.get('REFRESH_TOKEN_TTL', 604800));
    // current jti for the family; presence of the family key = not revoked.
    await this.redis.set(`rt:${family}`, jti, 'EX', ttl);
    return this.jwt.signAsync({ sub, jti, family }, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: ttl,
    });
  }

  /** Rotate: verify, detect reuse, issue a fresh pair on the SAME family. */
  async rotate(refreshToken: string): Promise<{ accessClaimsSub: string; family: string } | null> {
    let payload: RefreshClaims;
    try { payload = await this.jwt.verifyAsync(refreshToken, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') }); }
    catch { return null; }
    const current = await this.redis.get(`rt:${payload.family}`);
    if (current === null) return null;            // family revoked / expired
    if (current !== payload.jti) {                 // REUSE detected → revoke whole family
      await this.redis.del(`rt:${payload.family}`);
      return null;
    }
    return { accessClaimsSub: payload.sub, family: payload.family };
  }

  /** After rotate() OK, mint the next refresh on the same family and a fresh access token. */
  async rotateIssue(sub: string, family: string, access: AccessClaims): Promise<{ accessToken: string; refreshToken: string }> {
    const jti = randomUUID();
    const ttl = Number(this.config.get('REFRESH_TOKEN_TTL', 604800));
    await this.redis.set(`rt:${family}`, jti, 'EX', ttl);
    const accessToken = await this.signAccess(access);
    const refreshToken = await this.jwt.signAsync({ sub, jti, family }, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: ttl,
    });
    return { accessToken, refreshToken };
  }

  async revokeFamily(family: string): Promise<void> { await this.redis.del(`rt:${family}`); }

  /** Impersonation: scoped access token for the target, carrying impersonatorAdminId + 1h cap. */
  async issueImpersonation(target: AccessClaims, adminId: string): Promise<string> {
    const ttl = Number(this.config.get('IMPERSONATION_TTL', 3600));
    return this.signAccess({ ...target, impersonatorAdminId: adminId, impersonationExp: Math.floor(Date.now() / 1000) + ttl });
  }
}
```

> **Logout** must revoke the family. The family id isn't in the access token, so store the family id in a short server-side map keyed by `sub` on login, **or** include `family` as an access claim. Simplest: add `family` to `AccessClaims` so logout/`change-password` can call `revokeFamily`. Add `family: string` to `AccessClaims` and set it in `issueSession`/`rotateIssue`. Update the interface accordingly.

**Tests (`token.service.spec.ts`, mock Redis with `ioredis-mock` or a fake):**
- `issueSession` → access verifies with correct claims; refresh stored in Redis.
- `rotate` happy path returns family; `rotateIssue` updates the stored jti.
- **reuse:** rotate with an old (already-rotated) refresh → returns `null` AND family key deleted.
- revoked family → `rotate` returns `null`.

**Commit:** `feat(auth): add Redis provider + TokenService (rotation, reuse-detection, impersonation)`

---

### Task 2.6: Password service (argon2id)

**File (create):** `src/shared/auth/password.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id }); // NFR-006
  }
  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
  /** Generate a temp password for admin-created trainers (FR-005). */
  generateTemp(): string {
    return randomBytesBase62(12); // implement: crypto.randomBytes → base62, ≥1 letter & ≥1 number
  }
}
```

**Test:** hash≠plain; `verify(hash, plain)` true; `verify(hash, 'wrong')` false; `generateTemp()` matches the password policy regex from api-spec (`/(?=.*[A-Za-z])(?=.*\d)/`, ≥8).

**Commit:** `feat(auth): add PasswordService (argon2id) + temp-password generator`

---

### Task 2.7: Cookie + CSRF helpers

**Files (create):** `src/shared/auth/cookies.ts`, `src/shared/auth/csrf.ts`

> api-spec: `at` (httpOnly, Secure, SameSite=Strict, ~15m), `rt` (httpOnly), `csrf` (double-submit). CSRF header `X-CSRF-Token` on all state-changing requests → mismatch `403 CSRF_INVALID`.

```typescript
// cookies.ts
import { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';

export function baseCookieOpts(config: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE') === 'true',
    sameSite: 'strict',
    domain: config.get('COOKIE_DOMAIN'),
    path: '/',
  };
}
export function setAuthCookies(res: Response, config: ConfigService, at: string, rt: string) {
  const base = baseCookieOpts(config);
  res.cookie('at', at, { ...base, maxAge: Number(config.get('ACCESS_TOKEN_TTL', 900)) * 1000 });
  res.cookie('rt', rt, { ...base, maxAge: Number(config.get('REFRESH_TOKEN_TTL', 604800)) * 1000, path: '/api/v1/auth' });
}
export function clearAuthCookies(res: Response, config: ConfigService) {
  const base = baseCookieOpts(config);
  res.clearCookie('at', base);
  res.clearCookie('rt', { ...base, path: '/api/v1/auth' });
}
```

```typescript
// csrf.ts — wraps csrf-csrf doubleCsrf; expose middleware + the validation guard's reader.
import { doubleCsrf } from 'csrf-csrf';
// configure in a CsrfModule using CSRF_SECRET; cookie name 'csrf'; header 'x-csrf-token';
// ignoredMethods: GET/HEAD/OPTIONS. Export the generated middleware + token generator.
```

**Wiring:** apply the csrf middleware in `AppModule` via `configure(consumer)` for all routes **except** `Public` GET resolution (`/join/:code`, `/auth/*` reads) and excluding `GET`/`HEAD`/`OPTIONS` by default. When validation fails, csrf-csrf throws → map to `403 CSRF_INVALID` in the exception filter (add an `instanceof` check for its error, or catch in a small middleware wrapper).

**Commit:** `feat(auth): add cookie + CSRF (double-submit) helpers`

---

### Task 2.8: JwtAuthGuard (global, `@Public()`-aware)

**File (create):** `src/shared/auth/guards/jwt-auth.guard.ts`

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { IS_PUBLIC } from '@shared/common/decorators';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';
import { TokenService } from '../token.service';
import { CTX_KEYS, SessionPrincipal } from '@shared/context/request-context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private tokens: TokenService, private cls: ClsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.cookies?.['at'];
    if (!token) throw new AppException(AppErrorCode.UNAUTHENTICATED);
    let claims;
    try { claims = await this.tokens.verifyAccess(token); }
    catch { throw new AppException(AppErrorCode.UNAUTHENTICATED); }

    // impersonation hard expiry (FR-015): reject expired impersonation tokens.
    if (claims.impersonationExp && claims.impersonationExp < Math.floor(Date.now() / 1000)) {
      throw new AppException(AppErrorCode.UNAUTHENTICATED);
    }

    const principal: SessionPrincipal = {
      id: claims.sub, role: claims.role, email: '', emailVerified: claims.emailVerified,
      mustChangePassword: claims.mustChangePassword, isMinor: claims.isMinor, managedByParentUserId: null,
    };
    (req as Request & { user: SessionPrincipal }).user = principal;
    this.cls.set(CTX_KEYS.user, principal);
    if (claims.impersonatorAdminId) this.cls.set(CTX_KEYS.impersonatorAdminId, claims.impersonatorAdminId);
    return true;
  }
}
```

> Register as the **first** global guard (`APP_GUARD`) so it runs before Roles/Tenant/Minor.

**Test:** public route → allowed without cookie; no cookie on protected → `UNAUTHENTICATED`; valid `at` → `req.user` populated, CLS set; expired impersonation token → `UNAUTHENTICATED`.

**Commit:** `feat(auth): add JwtAuthGuard (cookie-based, Public-aware, CLS-populating)`

---

### Task 2.9: EmailVerifiedGuard · RolesGuard · ForcePasswordChangeGuard

**Files (create):** `src/shared/auth/guards/email-verified.guard.ts`, `roles.guard.ts`, `force-password-change.guard.ts`

- **EmailVerifiedGuard** (FR-003/D-1): skip if `@Public`; if `req.user && !user.emailVerified` → `403 EMAIL_NOT_VERIFIED`. (Login itself is Public, so its own verification check lives in `AuthService.login`.)
- **RolesGuard** (FR-008): read `@Roles()`; no metadata → allow; else require `user.role` ∈ roles, else `403 FORBIDDEN_ROLE`.
- **ForcePasswordChangeGuard** (FR-005): if `user.mustChangePassword` and the route is **not** marked `@AllowDuringForcedChange()` → `403 FORCE_PASSWORD_CHANGE`. Put `@AllowDuringForcedChange()` on `POST /auth/password/change`, `POST /auth/logout`, `GET /auth/me`.

Each is small; write a `.spec.ts` per guard covering allow/deny.

> **Global guard order** (registered in `AppModule` as ordered `APP_GUARD` providers): `JwtAuthGuard → EmailVerifiedGuard → ForcePasswordChangeGuard → RolesGuard → TenantGuard → MinorAccountGuard`. (Matches api-spec guard chain; ForcePasswordChange inserted right after verification.)

**Commit:** `feat(auth): add EmailVerified, Roles, ForcePasswordChange guards`

---

### Task 2.10: Tenancy — TenancyService (RLS GUC tx) + ScopedRepository + lint rule

**Files (create):** `src/shared/tenancy/tenancy.service.ts`, `scoped-repository.ts`, `src/shared/tenancy/tenant.types.ts`

> Architecture §Multi-Tenancy: scoped data-access requires a resolved `TrainerContext`; every tenant query appends `where(eq(table.trainerId, ctx.trainerId))`; per-tx GUC `SET LOCAL app.current_trainer_id` arms RLS.

```typescript
// tenancy.service.ts — run a unit of work inside a tx with the RLS GUC set from CLS (or an explicit trainerId for Super Admin).
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DRIZZLE, DrizzleDB } from '@shared/database/drizzle.provider';
import { DRIZZLE as DRIZZLE_TOKEN } from '@shared/database/drizzle.constants';
import { CTX_KEYS } from '@shared/context/request-context';
import { AppException } from '@shared/common/errors/app.exception';
import { AppErrorCode } from '@shared/common/errors/error-codes';

@Injectable()
export class TenancyService {
  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB, private readonly cls: ClsService) {}

  /** Resolve the active tenant from CLS (set by TenantGuard). Throws if absent. */
  currentTrainerId(): string {
    const id = this.cls.get(CTX_KEYS.activeTrainerId);
    if (!id) throw new AppException(AppErrorCode.TENANT_FORBIDDEN, { message: 'No active trainer context.' });
    return id;
  }

  /** Run fn inside a tx with RLS armed for the given (or current) trainer. */
  async runScoped<T>(fn: (tx: DrizzleDB) => Promise<T>, trainerId = this.currentTrainerId()): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.current_trainer_id = ${trainerId}`);
      return fn(tx as unknown as DrizzleDB);
    });
  }
}
```

```typescript
// scoped-repository.ts — base for tenant-owned tables; never expose unscoped access.
import { and, eq, SQL } from 'drizzle-orm';
import { TenancyService } from './tenancy.service';

export abstract class ScopedRepository {
  constructor(protected readonly tenancy: TenancyService) {}
  /** Compose the mandatory trainer predicate with any extra filters. */
  protected tenantWhere(trainerCol: SQL.Aliased | unknown, extra?: SQL): SQL {
    const base = eq(trainerCol as never, this.tenancy.currentTrainerId());
    return extra ? (and(base, extra) as SQL) : base;
  }
}
```

**Lint rule (close architecture Risk #1):** in `.eslintrc.cjs`, fill `no-restricted-imports` to forbid importing tenant-owned table symbols (`trainerPlayerAssociations`, `trainerCoachAssociations`, `shareLinks`, `childPurchaseApprovals`, `availabilityOverrides`, `trainerBranding`) **except** inside files under `src/shared/tenancy/` or `*.repository.ts`. Practical approach: a custom rule or a path-restricted `no-restricted-syntax`; document the convention in `backend/README.md` and enforce in code review if a full custom rule is out of scope.

**Test (`tenancy.service.spec.ts`):** mock `db.transaction` + `cls`; assert `runScoped` issues `SET LOCAL app.current_trainer_id`; `currentTrainerId()` throws `TENANT_FORBIDDEN` when CLS empty.

**Commit:** `feat(tenancy): add TenancyService (RLS GUC tx) + ScopedRepository base + lint convention`

---

### Task 2.11: TenantGuard (X-Active-Context) + MinorAccountGuard

**Files (create):** `src/shared/tenancy/tenant.guard.ts`, `src/shared/auth/guards/minor-account.guard.ts`, plus a small `ContextResolver` data-access for association checks.

> Implements api-spec §Context Switching header contract + architecture refinement (lines 184–238). Runs only on routes/controllers marked `@RequireContext()`.

**TenantGuard logic:**
1. Skip if `@Public` or not `@RequireContext()`.
2. Read header `X-Active-Context`. Missing → `400 VALIDATION_ERROR` with `details:[{ field:'X-Active-Context', message:'required' }]`.
3. Parse `"<subjectProfileId>:<trainerId>"`; malformed → same 400.
4. Authorize via `ContextResolver`:
   - subject owned by caller: `playerProfiles.id == subjectProfileId AND (userId == user.id OR parentUserId == user.id)`. (For coach subject: the coach's own profile.) Fail → `403 CONTEXT_FORBIDDEN`.
   - association active: a `trainer_player_associations` row `(playerProfileId=subject, trainerId, status='active')` exists. Not found → `403 CONTEXT_FORBIDDEN`; existed-but-inactive → `410 CONTEXT_INACTIVE`.
5. On pass: `cls.set(activeSubjectProfileId)`, `cls.set(activeTrainerId)`.

> Note: the association lookup itself must run **without** RLS (it's resolving which tenant to arm). Query `trainer_player_associations` directly in `ContextResolver` using a non-scoped read — this is the one sanctioned unscoped read of that table; place it in `src/shared/tenancy/` (allowed by the lint rule).

**MinorAccountGuard (FR-025):** if `user.isMinor`, block routes marked as parent-only / disallowed (token spend, add trainers, change associations, view family). Implement via a `@MinorForbidden()` decorator on those handlers → guard throws `403 MINOR_FORBIDDEN`. Allowed for minors: view, RSVP-pending, create purchase **request** (not spend).

**Tests:** TenantGuard — missing header 400; foreign subject 403; inactive association 410; valid → CLS set. MinorAccountGuard — minor on `@MinorForbidden()` route → 403; adult → pass.

**Commit:** `feat(tenancy): add TenantGuard (X-Active-Context auth) + MinorAccountGuard`

---

### Task 2.12: Throttler (Redis store)

**File (create):** `src/shared/security/throttler.config.ts` (or configure in `AppModule`).

> FR-007 brute-force protection. `@nestjs/throttler` with `@nest-lab/throttler-storage-redis` so limits are shared across nodes (NFR-005). Map the throttler exception to `429 RATE_LIMITED` + `Retry-After` in the exception filter.

- Global default: e.g. 120 req/min.
- Override per auth endpoint with `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on `login`, `password/forgot`, `resend-verification` (api-spec §Module A).
- Add a `ThrottlerExceptionFilter` (or branch in `AllExceptionsFilter`) → `AppException(RATE_LIMITED)` and set `Retry-After`.

**Commit:** `feat(security): add Redis-backed throttler + RATE_LIMITED mapping`

---

### Task 2.13: Mailer (provider-agnostic + console dev adapter + template registry)

**Files (create):** `src/shared/mailer/mailer.service.ts` (interface + token), `console-mailer.adapter.ts`, `mailer.module.ts`, `templates.ts`

> Architecture §Email: swappable `MailerService` + template registry. Q-01.04: template **list** is client-owned; enumerate the inferred set as typed templates.

```typescript
// mailer.service.ts
export interface MailMessage { to: string; templateId: MailTemplateId; vars: Record<string, string>; }
export abstract class MailerService { abstract send(msg: MailMessage): Promise<void>; }

// templates.ts — the inferred required set (requirements Gap Q-01.04):
export type MailTemplateId =
  | 'email.verification' | 'password.reset' | 'trainer.invite' | 'coach.invite'
  | 'child.approval-request' | 'sharelink.blocked-parent' | 'registration.confirm';
export const TEMPLATES: Record<MailTemplateId, { subject: string; render: (v: Record<string,string>) => string }> = {
  /* one entry each; render returns plain text/HTML using vars like {link}, {name}, {tempPassword} */
};
```

`ConsoleMailerAdapter.send` logs `to`/`subject`/rendered body (dev). `MailerModule` picks the adapter by `MAILER_DRIVER` (console now; SES/SMTP later). Provide `MailerService` via the chosen adapter.

**Commit:** `feat(mailer): add MailerService interface + console adapter + template registry`

---

### Task 2.14: Storage (interface + local adapter + sharp image pipeline)

**Files (create):** `src/shared/storage/storage.service.ts` (interface + token), `local-storage.adapter.ts`, `image.service.ts`, `storage.module.ts`, `file-validation.ts`

> Architecture §File storage: `StorageService` (S3 in prod, local/MinIO dev) + `sharp` for thumbnails/resize. api-spec uploads: `multipart/form-data` field `file`, `ParseFilePipe` (`MaxFileSizeValidator` 2 MB + `FileTypeValidator`).

```typescript
// storage.service.ts
export interface PutResult { url: string; key: string; }
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<PutResult>;
  abstract delete(key: string): Promise<void>;
}
```

- `LocalStorageAdapter`: writes to `STORAGE_LOCAL_DIR`, returns `${STORAGE_PUBLIC_BASE_URL}/${key}`. Serve the dir via `ServeStaticModule` or an express static mount at `/static`.
- `image.service.ts`: `processAvatar(buf)` → original + 128×128 thumbnail (`sharp`); `processLogo(buf)` → resize to ~200×200, preserve SVG as-is (sharp can rasterize or pass through). Returns buffers + content types.
- `file-validation.ts`: shared `ParseFilePipe` builders — `avatarFilePipe` (PNG/JPG ≤2 MB), `logoFilePipe` (PNG/JPG/SVG ≤2 MB). On failure NestJS throws — map to `413 FILE_TOO_LARGE` / `415 UNSUPPORTED_FILE_TYPE` (custom validators that throw `AppException`).

**Tests (`image.service.spec.ts`, `file-validation.spec.ts`):** thumbnail dimensions; oversize → `FILE_TOO_LARGE`; wrong MIME → `UNSUPPORTED_FILE_TYPE`; SVG allowed for logo, rejected for avatar.

**Commit:** `feat(storage): add StorageService + local adapter + sharp pipeline + upload validation`

---

### Task 2.15: Messaging (transactional outbox + BullMQ relay)

**Files (create):** `src/shared/messaging/outbox.service.ts`, `outbox.processor.ts`, `messaging.module.ts`

> Architecture §Cross-epic side effects + §Async: every email and cross-epic event (RSVP cancel, payment) is written to `outbox_messages` **in the same tx** as the state change, then relayed by a BullMQ worker. Keeps DB tx local and side effects retryable.

```typescript
// outbox.service.ts
import { DrizzleDB } from '@shared/database/drizzle.provider';
import { outboxMessages } from '@shared/database/schema';

export class OutboxService {
  /** Enqueue WITHIN an existing tx so the message commits atomically with the state change. */
  async enqueue(tx: DrizzleDB, type: string, payload: unknown, availableAt = new Date()): Promise<void> {
    await tx.insert(outboxMessages).values({ type, payload, availableAt });
  }
}
```

- `outbox.processor.ts`: a worker (BullMQ repeatable job, or `@nestjs/schedule` interval in MVP) that claims `PENDING` rows where `availableAt <= now()` (`FOR UPDATE SKIP LOCKED`), dispatches by `type`:
  - `email.*` → `MailerService.send`
  - `rsvp.cancel`, `payment.*` → log/no-op (Epic-02/05 consume later)
  - on success → `status='SENT'`, `processedAt=now()`; on failure → `attempts++`, keep `PENDING` with backoff.
- `messaging.module.ts`: registers the BullMQ queue + the processor; exports `OutboxService`.

**Test (`outbox.processor.spec.ts`):** a PENDING `email.verification` row → calls `MailerService.send` with the right template/vars → row marked `SENT`; failure → `attempts` incremented, stays `PENDING`.

**Commit:** `feat(messaging): add transactional outbox + BullMQ relay`

---

### Task 2.16: Audit service + interceptor

**Files (create):** `src/shared/audit/audit.service.ts`, `audit.interceptor.ts`, `audit.module.ts`

> NFR-008: audit sensitive ops (impersonation, deletion, override). Pulls `actorUserId` + `impersonatorAdminId` + `ip` from CLS so every write is attributed correctly (including impersonated actions, FR-016).

```typescript
// audit.service.ts
@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB, private cls: ClsService) {}
  async log(entry: { action: string; entityType?: string; entityId?: string; metadata?: Record<string, unknown> }) {
    await this.db.insert(auditLogs).values({
      actorUserId: this.cls.get(CTX_KEYS.user)?.id ?? null,
      impersonatorAdminId: this.cls.get(CTX_KEYS.impersonatorAdminId) ?? null,
      ip: this.cls.get(CTX_KEYS.ip) ?? null,
      ...entry,
    });
  }
}
```

`AuditInterceptor` (optional, for broad coverage) logs mutating requests; explicit `auditService.log(...)` calls remain in impersonation/deletion/override services for precise metadata.

**Commit:** `feat(audit): add AuditService + interceptor (CLS-attributed)`

---

### Task 2.17: Assemble AppModule + global guard order

**File (modify):** `src/app.module.ts`

Wire (in this order of global guards): `ConfigModule.forRoot({ isGlobal: true, validate })`, `ClsModule` (2.1), `DrizzleModule`, `RedisModule`, `ThrottlerModule`, shared modules (Mailer, Storage, Messaging, Audit), then feature modules (added per phase). Register `APP_GUARD` providers **in this exact order**: `JwtAuthGuard, EmailVerifiedGuard, ForcePasswordChangeGuard, RolesGuard, TenantGuard, MinorAccountGuard`. Register `APP_PIPE` (ValidationPipe already in main.ts is fine) and apply CSRF middleware via `configure()`.

> Add a `config/env.validation.ts` using `class-validator` on an `EnvVars` class; pass as `validate` to `ConfigModule` so a missing `DATABASE_URL`/secret fails fast at boot.

**Verify:** `npm run start:dev` boots with all shared modules; `npm test` green for all Phase 2 specs; `npm run build` clean.

**Commit:** `feat(app): assemble AppModule with ordered global guard chain + env validation`

---

## Phase 3 — Module A: Auth (`/auth`)

> Contract: api-spec §Module A (lines 209–314). **No `POST /auth/register`** (P-2). Endpoints: `login, logout, refresh, verify-email, resend-verification, password/forgot, password/reset, password/change, me`. Throttle on `login`, `password/forgot`, `resend-verification`. CSRF on all POSTs.

**Files (create):**
- `src/modules/auth/dto/` — copy `LoginDto, VerifyEmailDto, ResendVerificationDto, ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, SessionUserDto` from api-spec lines 224–272.
- `src/modules/auth/auth.repository.ts` — user lookups + token writes.
- `src/modules/auth/auth.service.ts` — login/verify/resend/logout/refresh/me.
- `src/modules/auth/password.service.ts` (module-level flows: forgot/reset/change) — distinct from the shared `PasswordService` (hashing); name it `AuthPasswordFlowService` to avoid confusion.
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.module.ts`
- Tests under `src/modules/auth/__tests__/`.

### Task 3.1: AuthRepository

Methods (all on `DRIZZLE`, `users` is NOT tenant-owned → no scoping):
- `findByEmail(email)`, `findById(id)`, `setLastLogin(id)`, `markEmailVerified(userId)`, `updatePasswordHash(userId, hash, { clearMustChange })`.
- Verification tokens: `createVerificationToken(userId, tokenHash, expiresAt)`, `findVerificationByHash(hash)`, `markVerificationUsed(id)`.
- Reset tokens: `createResetToken`, `findResetByHash`, `markResetUsed`.

Emails are compared **lower-cased** (normalize at the service boundary). Write a `.spec.ts` only if logic beyond passthrough; otherwise cover via service tests.

**Commit:** `feat(auth): add AuthRepository`

### Task 3.2: AuthService.login (TDD)

> FR-001/003/005/006/007. Generic `INVALID_CREDENTIALS` (no enumeration). Verification + status + temp-password branches per api-spec §POST /auth/login.

**Test first (`auth.service.spec.ts`)** — mock repo, PasswordService, TokenService:
- unknown email → `INVALID_CREDENTIALS`.
- wrong password → `INVALID_CREDENTIALS`.
- `status=INACTIVE` → `ACCOUNT_INACTIVE`.
- `emailVerified=false` → `EMAIL_NOT_VERIFIED` with `{ canResend: true }`.
- happy path → returns `SessionUserDto` + cookie material; `setLastLogin` called.
- temp-password user (`mustChangePassword=true`) → returns 200 with `mustChangePassword:true` (do **not** block here; ForcePasswordChangeGuard blocks other routes).

**Implement** `login(dto): { user: SessionUserDto; cookies }`:
1. normalize email; `findByEmail`. Missing → `INVALID_CREDENTIALS`.
2. `passwordService.verify`. False → `INVALID_CREDENTIALS`.
3. `status === 'INACTIVE'|'DELETED'` → `ACCOUNT_INACTIVE`.
4. `!emailVerified` → `EMAIL_NOT_VERIFIED` (`extra:{canResend:true}`).
5. `tokenService.issueSession(claims)`; `setLastLogin`. Build cookies via `setAuthCookies`.
6. Build `SessionUserDto` (+ `defaultContext` for PLAYER from `users.defaultSubjectProfileId/defaultTrainerId`).

**Controller** wires `@Res({ passthrough: true })`, sets cookies, returns DTO (pattern in api-spec lines 986–1009).

**Commit:** `feat(auth): implement login (verification/status/temp-password branches)`

### Task 3.3: verify-email + resend-verification (TDD)

> FR-003. Tokens hashed; verification expires 24h (NFR-007). Resend always `202` (no enumeration).

- `verifyEmail(token)`: hash incoming token; `findVerificationByHash`; null→`TOKEN_INVALID`; `usedAt`→`TOKEN_USED`; `expiresAt<now`→`TOKEN_EXPIRED`; else `markEmailVerified` + `markVerificationUsed` (1 tx) → `{ verified:true }`.
- `resendVerification(email)`: find unverified user; if exists, create token (hash stored, raw emailed via outbox `email.verification`); **always** return 202.

Tests cover each token branch + resend-no-enumeration. **Commit:** `feat(auth): implement email verification + resend`

### Task 3.4: password forgot/reset/change (TDD)

> FR-004/005. Reset expires 1h, single-use. Change rotates session.

- `forgot(email)`: always 202; if user exists, create reset token + outbox `password.reset`.
- `reset(dto)`: token branches (`TOKEN_INVALID/EXPIRED/USED`); on success hash new password, `updatePasswordHash`, mark token used, **revoke all refresh families** for the user → `{ reset:true }`.
- `change(userId, dto)`: if not temp-password flow, verify `currentPassword` (`INVALID_CREDENTIALS` on mismatch); hash new; `updatePasswordHash({ clearMustChange:true })`; revoke old refresh family + re-issue cookies (rotate session) → 204.

Tests for each branch. **Commit:** `feat(auth): implement password forgot/reset/change with session rotation`

### Task 3.5: refresh + logout + me (TDD)

- `refresh`: read `rt` cookie; `tokenService.rotate` → null ⇒ `401 UNAUTHENTICATED` (+ clear cookies); else `rotateIssue` new pair, set cookies, 204.
- `logout`: revoke family (from access claim `family`), `clearAuthCookies`, 204.
- `me`: build `SessionUserDto` from `req.user` (+ `impersonatedBy` when `impersonatorAdminId` present — Module G).

Tests: rotate reuse → 401; logout clears + revokes; me shape. **Commit:** `feat(auth): implement refresh (rotation), logout, me`

### Task 3.6: AuthController + module wiring + Swagger

Decorate every endpoint per api-spec §Swagger conventions (lines 971–1009): `@ApiTags('auth')`, `@Public()` where applicable, `@Throttle(...)` on the three, `@ApiOperation`, `@ApiResponse` per status with `ErrorResponseDto`. Register `AuthModule` in `AppModule`.

**Verify:** module-level e2e (Phase 12) covers register-via-join→verify→login later; for now `auth.service.spec.ts` green + `npm run build` clean.

**Commit:** `feat(auth): add AuthController + module + Swagger docs`

---

## Phase 4 — Module B: Users / Super Admin (`/users`)

> Contract: api-spec §Module B (lines 318–437). Guard: `@Roles(SUPER_ADMIN)` on all; cross-tenant by design (no `X-Active-Context`). `users` + profile tables are NOT RLS-scoped, so Super Admin reads them directly.

**Files (create):** `dto/` (copy `CreateTrainerDto, UpdateUserDto, UserListQueryDto, DeactivateUserDto, GdprDeleteDto, UserResponseDto, GdprDeleteResultDto, CampConversionDto` from api-spec lines 325–434), `users.repository.ts`, `user-admin.service.ts`, `anonymization.service.ts`, `users.controller.ts`, `users.module.ts`, tests.

### Task 4.1: UsersRepository (keyset list + lookups)

- `list(query: UserListQueryDto)`: keyset over `(createdAt,id)` with optional `search` (ILIKE on name/email), `role`, `status`, and `trainerId` filter (join `trainer_player_associations`/`trainer_coach_associations` to find users under a trainer). Fetch `limit+1`, build page via `keysetPage` (2.3). Backed by `users(email)` + `users_role_status_idx` (NFR-002).
- `findById`, `create(user)`, `update(id, patch)`, `setStatus(id, status)`.

**Test:** list returns `nextCursor`/`hasMore`; search filters; second page continues from cursor. (Use a test DB or mock the query builder — prefer a lightweight integration test against the dev DB for the keyset correctness.)

**Commit:** `feat(users): add UsersRepository with keyset list + filters`

### Task 4.2: UserAdminService.createTrainer (TDD)

> FR-011/BR-002. Creates `User{role:TRAINER}` + `TrainerProfile` in **1 tx**; issues invite **or** temp password (FR-005) via outbox `trainer.invite`.

**Test:** duplicate email → `EMAIL_EXISTS`; success → user ACTIVE + TrainerProfile row + outbox `trainer.invite` enqueued; `onboardingMode:'TEMP_PASSWORD'` → `mustChangePassword:true` + temp password in the mail vars.

**Implement:** normalize email; check uniqueness; tx: insert user (hash temp password OR a random placeholder for invite flow + a verification/invite token), insert trainer_profile, `outbox.enqueue(tx,'trainer.invite',{...})`. Trainer accounts created by admin are considered verified (admin-trusted) — set `emailVerified:true`; document this choice. Return `UserResponseDto`.

**Commit:** `feat(users): implement createTrainer (1-tx user+profile, invite/temp-password)`

### Task 4.3: list / get / edit (TDD-light)

- `GET /users` → `list`. `GET /users/:id` (`ParseUUIDPipe`) → `UserResponseDto` or `NOT_FOUND`. `PATCH /users/:id` → update firstName/lastName/phone (email/role immutable per DTO) → `UserResponseDto`.

**Commit:** `feat(users): list/get/edit endpoints`

### Task 4.4: deactivate / reactivate (TDD)

> FR-013/BR-010 soft delete. `setStatus(INACTIVE|ACTIVE)`. Deactivate optionally records reason (audit). Login already blocks INACTIVE (`ACCOUNT_INACTIVE`, Task 3.2). History preserved (no row deletion).

**Test:** deactivate → status INACTIVE; reactivate → ACTIVE; both return DTO; audit logged.

**Commit:** `feat(users): deactivate/reactivate (soft delete, reversible)`

### Task 4.5: AnonymizationService + GDPR delete (TDD)

> FR-014/BR-010/NFR-008. **1 tx:** anonymize `User` PII in place + write `UserDeletionLog`; analytics/history rows keep FK and render "Deleted User"; irreversible; audited.

**Test:** `DELETE /users/:id` with `confirmEmail` ≠ target → `VALIDATION_ERROR`; success → email becomes `deleted-user-<uuid>@anon.invalid`, firstName `Deleted`, lastName `User`, `status=DELETED`, photo/phone nulled, `UserDeletionLog` row written, returns `GdprDeleteResultDto{ anonymized:true, deletionLogId, historyRetained:true }`. Associations/profiles remain (FK intact).

**Implement:** validate `confirmEmail` equals current email; tx: update user PII → anon values, `status=DELETED`; insert `user_deletion_logs`; `auditService.log('user.gdpr_delete', ...)`. Revoke the user's refresh families.

**Commit:** `feat(users): AnonymizationService + GDPR delete (1-tx, history-preserving)`

### Task 4.6: Controller + Swagger + module

`@ApiTags('users')`, `@Roles(SUPER_ADMIN)` at controller. `POST /users/import/camp` → **stub** returning `{ userId, created, associated }` (FR-040; full flow Epic-08) — implement minimally: create-or-find user + associate to `trainerId`, mark TODO-Epic-08 in code comment but no leftover `TODO` token (use a doc comment referencing FR-040). Register module.

**Commit:** `feat(users): UsersController + camp-import stub + Swagger`

---

## Phase 5 — Module C: Profiles (`/me/profile`)

> Contract: api-spec §Module C (lines 441–516). `JwtAuthGuard` only (self-service). `email`/`role`/`skillLevel` read-only (whitelist rejects them). Response shape discriminated by role.

**Files (create):** `dto/` (copy `UpdateTrainerProfileDto, UpdateCoachProfileDto, UpdatePlayerProfileDto, EmergencyContactDto, ProfileResponseDto` + the `TrainerDetails/CoachDetails/PlayerDetails` blocks from api-spec lines 449–501), `profiles.repository.ts`, `profile.service.ts`, `profile.controller.ts`, `profiles.module.ts`, tests.

### Task 5.1: ProfilesRepository
Per-role reads/writes: `getTrainerProfile(userId)`, `getCoachProfile(userId)`, `getSelfPlayerProfile(userId)` (`isSelf=true`), and matching `update*`. `setUserPhoto(userId, photoUrl, thumbnailUrl)`.

### Task 5.2: ProfileService.getMine / updateMine (TDD)
> FR-038. Server selects the validator + details block by `req.user.role`.

**Test:** trainer → trainer details; coach → coach details; player(parent) → **self** PlayerProfile details; attempt to set `email`/`skillLevel` → rejected by global whitelist (`VALIDATION_ERROR`). Update persists allowed fields only.

**Implement:** `getMine(user)` returns `ProfileResponseDto{ id,role,email,firstName,lastName,phone,photoUrl,thumbnailUrl,details }` assembling `details` from the role table. `updateMine(user, dto)` dispatches by role to the right repo update; common fields (firstName/lastName/phone) live on `users`.

**Commit:** `feat(profiles): get/update own profile (role-discriminated, read-only enforcement)`

### Task 5.3: POST /me/profile/photo (TDD)
> Upload PNG/JPG ≤2 MB; `image.service.processAvatar` → original + thumbnail via `StorageService`; persist URLs; return `{ photoUrl, thumbnailUrl }`. Errors `413/415` via `avatarFilePipe` (2.14).

**Test:** oversize → `FILE_TOO_LARGE`; wrong type → `UNSUPPORTED_FILE_TYPE`; valid → URLs returned + persisted.

**Commit:** `feat(profiles): avatar upload with thumbnail`

### Task 5.4: Controller + module + Swagger
`@ApiTags('profiles')`, discriminated-union response via `@ApiExtraModels` + `oneOf` (api-spec line 982). Register module.

**Commit:** `feat(profiles): controller + module + Swagger`

---

## Phase 6 — Context (`/me/contexts`)

> Contract: api-spec §Context Switching (lines 520–571) + brainstorm design. Feeds the switcher and persists the default. `JwtAuthGuard` only (these two endpoints are NOT context-scoped; they list contexts).

**Files (create):** `dto/` (copy `ContextRefDto, TrainerChannelDto, SubjectDto, ContextsResponseDto, SetDefaultContextDto` from api-spec lines 528–557), `context.repository.ts`, `context.service.ts`, `context.controller.ts`, `context.module.ts`, tests.

### Task 6.1: ContextService.getContexts (TDD)
> Build `subjects[]`: the caller's own player profile (`isSelf`) + children (`parentUserId = user.id`), each with its **active** `trainer_player_associations` mapped to `TrainerChannelDto{ trainerId, name, status }` (join `trainer_profiles` for `businessName`). Plus `defaultContext` from `users.defaultSubjectProfileId/defaultTrainerId`.

**Test:** parent with self+2 children → correct subjects + trainer channels; coach/trainer/super-admin → empty subjects (no switcher); defaultContext echoed.

> This read crosses tenants intentionally (a parent spans multiple trainer orgs) — it's an account-zone (Zone-1) read; query associations directly (sanctioned, like ContextResolver). Place the cross-tenant association read in this module's repository and document it.

**Commit:** `feat(context): GET /me/contexts (subjects → active trainer channels)`

### Task 6.2: PUT /me/contexts/default (TDD)
> Validate the `(subjectProfileId, trainerId)` belongs to the caller + association active (reuse `ContextResolver`); on fail `403 CONTEXT_FORBIDDEN`; persist to `users` → 204.

**Commit:** `feat(context): PUT /me/contexts/default (validated persistence)`

### Task 6.3: Controller + module + Swagger
`@ApiTags('context')`. Register module.

**Commit:** `feat(context): controller + module + Swagger`

---

## Phase 7 — Module D: ShareLinks & Associations (`/sharelinks`, `/join`)

> Contract: api-spec §Module D (lines 575–671). The **registration transaction** lives here (P-2). `/sharelinks/*` = `@Roles(TRAINER)` + `@RequireContext()` (own org). `/join/*` = Public (resolve) / Public-or-JWT (consume). **Depends on Phases 4 & 5** (creates Users + profiles).

**Files (create):** `dto/` (copy `CreateShareLinkDto, CoachInviteDto, ShareLinkResponseDto, JoinResolveDto, JoinRegisterDto, JoinAssociateDto` from api-spec lines 583–635), `sharelinks.repository.ts`, `sharelink.service.ts`, `association.service.ts`, `sharelinks.controller.ts`, `join.controller.ts`, `sharelinks.module.ts`, tests.

### Task 7.1: ShareLinkService — generate + list + revoke (TDD)
> FR-033/BR-011. Static: `type:'static'`, `maxUses:null`, `expiresAt:null`, unlimited. Unique coach: `type:'unique'`, `maxUses:1`, `expiresAt:+7d`, `status:'PENDING'`, bound `targetEmail`. `code` = collision-checked random base62 (≥6 chars). Tenant-scoped (own links only).

**Test:** static defaults; coach invite defaults (+7d, maxUses 1, PENDING, email bound); list filters by type/status (keyset); `DELETE /sharelinks/:id` sets `active:false` and is tenant-guarded (foreign link → `TENANT_FORBIDDEN`).

**Implement** via `TenancyService.runScoped` (writes carry `trainerId`). `generateUniqueCoach` also enqueues outbox `coach.invite`.

**Commit:** `feat(sharelinks): generate static/coach links, list, revoke (tenant-scoped)`

### Task 7.2: GET /join/:code resolve (TDD, Public)
> FR-017/018/028. Never 404 on expired/used — return `status` (`VALID|EXPIRED|USED|INVALID`). Minimal PII: trainer display name + branding. Coach link → `prefillEmail`, `requiresAccount`.

**Test:** valid static → `VALID`, branding present; expired unique → `EXPIRED`; used unique → `USED`; unknown code → `INVALID`.

**Commit:** `feat(sharelinks): public join resolve`

### Task 7.3: AssociationService (TDD)
> Core associations. `associatePlayer(playerProfileId, trainerId, viaShareLinkId)` — idempotent (existing active link → return it). `associateCoach(coachProfileId, trainerId)` — **single-trainer guard** (BR-003): the partial-unique index throws on a second active trainer → catch → `COACH_ALREADY_ASSIGNED`. `removeAssociation` — soft-delete + outbox `rsvp.cancel` (Epic-02 hook).

**Test:** associatePlayer idempotency; associateCoach second trainer → `COACH_ALREADY_ASSIGNED`; remove → `status=inactive`, `deletedAt` set, outbox `rsvp.cancel` enqueued.

**Commit:** `feat(associations): associate player/coach (single-trainer guard) + soft-remove`

### Task 7.4: POST /join/:code consume — the registration tx (TDD)
> The most important transaction in the epic (api-spec §POST /join/:code; architecture §Tx Boundaries).

**Branch 1 — new user (no session):** `JoinRegisterDto`. **1 tx:** create `User` + role profile (`PLAYER`→PlayerProfile `isSelf:true`; coach invite→CoachProfile) + `Trainer*Association` + increment ShareLink `useCount` (+ for unique set `status:'ACCEPTED'`, `active:false`). Returns `SessionUserDto` + `Set-Cookie` (logged in). Static ⇒ PLAYER; coach invite ⇒ COACH (with single-trainer guard).
> New PLAYER accounts via ShareLink: send `email.verification` + `registration.confirm` via outbox. **Decision:** they are logged in immediately but `EmailVerifiedGuard` will block scoped actions until verified (D-1) — confirm this UX matches client; document in code.

**Branch 2 — existing user (JWT):** `JoinAssociateDto`. Associate the chosen owned subject (default self) → returns `{ association, context }`. No new account (FR-018).

**Errors:** `410 SHARELINK_EXPIRED|USED`, `404` invalid code, `409 EMAIL_EXISTS` (new-user branch), `409 COACH_ALREADY_ASSIGNED`, `403 MINOR_FORBIDDEN` (logged-in child consuming a new-trainer link → parent emailed `sharelink.blocked-parent`, FR-026), `400` (coach link email ≠ prefill).

**Tests:** new player register happy path (user+profile+assoc+useCount in one tx; cookies set); duplicate email → `EMAIL_EXISTS`; coach invite single-use → second consume `SHARELINK_USED`; expired → `SHARELINK_EXPIRED`; minor + new-trainer link → `MINOR_FORBIDDEN` + outbox `sharelink.blocked-parent`.

**Commit:** `feat(join): consume ShareLink — register-new + associate-existing (atomic tx)`

### Task 7.5: Controllers + module + Swagger
Two controllers (`SharelinksController`, `JoinController`). `@ApiTags`, CSRF on POSTs, `@RequireContext()` on `/sharelinks/*`. Register module. **Commit:** `feat(sharelinks): controllers + module + Swagger`

---

## Phase 8 — Module E: Family / Parent-Child (`/family`)

> Contract: api-spec §Module E (lines 675–792). Guard `@Roles(PLAYER)`; parent-only mutations carry `@MinorForbidden()`. Children/associations/approvals are **Zone-1 (account-global)** → NO `X-Active-Context`. **Depends on Phase 7** (associations).

**Files (create):** `dto/` (copy `CreateChildDto, UpdateChildDto, ChildTrainerAssocDto, TokenSettingDto, PurchaseRequestDto, ApprovalDecisionDto, ApprovalResponseDto, FamilyResponseDto, ChildSummaryDto, PlayerProfileSummaryDto` from api-spec lines 683–744), `family.repository.ts`, `family.service.ts`, `purchase-approval.service.ts`, `child-permission.policy.ts`, `family.controller.ts`, `family.module.ts`, tests.

### Task 8.1: FamilyService.createChild (TDD)
> FR-021/BR-006/BR-013. Age 1–18 (DTO `@Min(1)@Max(18)`). Duplicate name+age → `409 DUPLICATE_CHILD_WARNING` unless `confirmDuplicate:true`. Creates a child `PlayerProfile{ isChild:true, parentUserId:user.id }`. (Minor login `User` is created lazily/optionally — P-5; for now create the profile; child-login provisioning can be a follow-up flag.)

**Test:** age 0 or 19 → `VALIDATION_ERROR`; duplicate without confirm → `DUPLICATE_CHILD_WARNING`; with confirm → created; child profile owned by parent.

**Commit:** `feat(family): createChild (age 1–18, duplicate warning)`

### Task 8.2: GET /family + get/edit child (TDD)
> FR-027. `GET /family` → `FamilyResponseDto{ self, children[] (with associations + token setting), pendingApprovals count }`. Child session calling `/family` → `403 MINOR_FORBIDDEN`. `GET/PATCH /family/children/:id` owner-only (`TENANT_FORBIDDEN` if not caller's child).

**Commit:** `feat(family): roster + child get/edit`

### Task 8.3: child↔trainer associations (TDD)
> FR-023. `POST /family/children/:id/trainers` (`code` or `trainerId`) → `associatePlayer` for the child (idempotent → 200 with existing). `DELETE .../trainers/:trainerId` → **1 tx** soft-delete + outbox `rsvp.cancel`. New context appears in switcher.

**Commit:** `feat(family): add/remove child↔trainer associations`

### Task 8.4: token-setting + PurchaseApprovalService (TDD — state machine)
> FR-024/BR-008. `PUT .../token-setting` (per-child toggle, default require). Purchase request: USD **always** needs approval; TOKEN obeys the child's setting (may auto-approve). `expiresAt:+48h`. 48h auto-deny via BullMQ delayed job (architecture §Async) — on fire, if still PENDING → `EXPIRED`. approve/deny → parent-only (`@MinorForbidden()`), `410 APPROVAL_EXPIRED` if past window, `409` if already decided. Side effect: parent email + in-app notify (outbox `child.approval-request`). Payment **execution** is Epic-05 (record only).

**Test (state machine):** USD request → PENDING + 48h job scheduled + parent notified; TOKEN with `allowTokenWithoutApproval:true` → auto-APPROVED; approve PENDING → APPROVED; deny → DENIED; approve after expiry → `APPROVAL_EXPIRED`; double-decision → `409`; BullMQ expiry fires → `EXPIRED` (only if still PENDING).

**Commit:** `feat(family): purchase approval state machine + 48h auto-deny + token setting`

### Task 8.5: ChildPermissionPolicy + controller + module
> FR-025/FR-026 CAN/CANNOT matrix. Encode allowed/blocked actions; `MinorAccountGuard` + `@MinorForbidden()` enforce. Controller `@ApiTags('family')`, `@Roles(PLAYER)`. Register module.

**Commit:** `feat(family): child permission policy + controller + module`

---

## Phase 9 — Module F: Availability / Best Times (`/availability`, `/trainer/availability`)

> Contract: api-spec §Module F (lines 796–868). **P-4: shared-per-child (no `trainerId`).** `subjectType ∈ {player, coach}`. ⚠️ **Confirm Best-Times scoping with client before building** (flagged in spec + brainstorm §9) — build shared-per-child; if client wants per-coach, add `trainerId` and move to Zone-3.

**Files (create):** `dto/` (copy `TimeSlotDto, SetAvailabilityDto, AvailabilityResponseDto, TrainerAvailabilityQueryDto, OverrideDto` from api-spec lines 809–847), `availability.repository.ts`, `availability.service.ts`, `override.service.ts`, `availability.controller.ts`, `availability.module.ts`, tests.

### Task 9.1: AvailabilityService get/set (TDD)
> FR-030/039. `GET /availability/:subjectType/:subjectId` — owner (own coach profile / owned-or-parented player profile) **or** an associated TRAINER may read; else `TENANT_FORBIDDEN`. `PUT` — owner only; **full replace**; validate `start<end` and **reject overlapping slots** on the same day → `VALIDATION_ERROR`.

**Test:** overlap → `VALIDATION_ERROR`; start≥end → `VALIDATION_ERROR`; PUT replaces prior slots; non-owner PUT → `TENANT_FORBIDDEN`; associated trainer GET allowed.

**Implement:** authorization helper resolves subject ownership/association; PUT does delete-all-for-subject + insert-new in one tx; slot overlap check in service.

**Commit:** `feat(availability): get/set Best/My Times (overlap validation, full replace)`

### Task 9.2: GET /trainer/availability (TDD)
> FR-034. `@Roles(TRAINER)` + `@RequireContext()`. List players associated with the trainer, with their slots, filtered by `dayOfWeek`/`availableAt`/`search`; keyset paginated. Advisory only (BR-012). Backed by `availability_subject_idx`.

**Test:** returns associated players only (tenant isolation); day/time filter narrows; pagination works.

**Commit:** `feat(availability): trainer view + filter`

### Task 9.3: OverrideService + POST /availability/overrides (TDD)
> FR-031/035. `@Roles(TRAINER)` + `@RequireContext()`. Record `AvailabilityOverride{ eventId, coachId, trainerId, overriddenBy, reason }`; `reason` required; optional coach notification (Q-01.06, toggle via outbox). Event linkage validated in Epic-02 — contract only.

**Test:** missing reason → `VALIDATION_ERROR`; success → row written + audit logged.

**Commit:** `feat(availability): conflict override with logged reason`

### Task 9.4: Controller + module + Swagger
Register module. **Commit:** `feat(availability): controller + module + Swagger`

---

## Phase 10 — Module G: Impersonation (`/impersonate`, `/impersonation`)

> Contract: api-spec §Module G (lines 872–926). `@Roles(SUPER_ADMIN)` on start/history. Impersonation token carries `impersonatorAdminId`; every action attributed to the admin (NFR-008). 1h hard expiry (claim + BullMQ revoke).

**Files (create):** `dto/` (copy `StartImpersonationDto, ImpersonationStateDto, ImpersonationHistoryQueryDto, ImpersonationLogDto` from api-spec lines 880–909), `impersonation.repository.ts`, `impersonation.service.ts`, `impersonation.controller.ts`, `impersonation.module.ts`, tests.

### Task 10.1: ImpersonationService.start (TDD)
> FR-015/BR-009. Target = any user **except** another Super Admin (`403 IMPERSONATE_SUPER_ADMIN`) and not inactive (`403 ACCOUNT_INACTIVE`). Issue scoped access token for the target carrying `impersonatorAdminId` (`tokenService.issueImpersonation`, 1h). Write `ImpersonationLog` (start). Schedule BullMQ revoke at +1h. Set `at` cookie to the impersonation token.

**Test:** target SUPER_ADMIN → `IMPERSONATE_SUPER_ADMIN`; inactive target → `ACCOUNT_INACTIVE`; success → ImpersonationLog row, cookie reissued, returns `ImpersonationStateDto{ impersonating:true, expiresAt }`.

**Commit:** `feat(impersonation): start (super-admin block, 1h token, audit log)`

### Task 10.2: exit + history (TDD)
- `exit`: valid only while impersonating (`impersonatorAdminId` in claims). Restore the admin session (re-issue admin cookies — re-login the admin id), close the `ImpersonationLog` (`endedAt`, `durationSec`). Idempotent no-op if not impersonating.
- `history`: `@Roles(SUPER_ADMIN)`, keyset; filters `adminId/targetUserId/from/to`; join users for emails → `ImpersonationLogDto`.

**Test:** exit sets endedAt+duration, restores admin; history returns who/whom/start/end/duration filtered.

> **Admin session restoration:** on `start`, also stash the admin's identity so `exit` can re-mint the admin session. Simplest: encode `impersonatorAdminId` in the impersonation token (already there) → `exit` re-issues a normal session for that admin id. Document this.

**Commit:** `feat(impersonation): exit + history report`

### Task 10.3: Controller + module + Swagger
Register module. **Commit:** `feat(impersonation): controller + module + Swagger`

---

## Phase 11 — Module H: Portal Branding (`/trainer/branding`, `/branding`)

> Contract: api-spec §Module H (lines 930–967). `/trainer/branding/*` = `@Roles(TRAINER)` + `@RequireContext()` (own org). `/branding/:trainerId` = any authenticated user. Cache per-trainer branding in Redis (read-heavy); invalidate on write.

**Files (create):** `dto/` (copy `UpdateBrandingDto, BrandingResponseDto` from api-spec lines 938–950), `branding.repository.ts`, `branding.service.ts`, `branding.controller.ts`, `branding.module.ts`, tests.

### Task 11.1: BrandingService get/set color + cache (TDD)
> FR-037. `GET/PUT /trainer/branding` (own org). Hex validated by DTO regex. On write → upsert `trainer_branding` + invalidate Redis cache. `GET /branding/:trainerId` → cached read (fallback to default `#1A73E8` if none) → `404 NOT_FOUND` only if trainer doesn't exist.

**Test:** bad hex → `VALIDATION_ERROR`; set color → persisted + cache busted; public read returns cached value.

**Commit:** `feat(branding): get/set primary color + Redis cache`

### Task 11.2: POST /trainer/branding/logo (TDD)
> Upload PNG/JPG/**SVG** ≤2 MB, ~200×200 auto-resized (`image.service.processLogo`); store via `StorageService`; update `logoUrl`; bust cache. Errors `413/415` via `logoFilePipe`.

**Test:** SVG allowed; oversize → `FILE_TOO_LARGE`; non-image → `UNSUPPORTED_FILE_TYPE`; success → new `logoUrl`.

**Commit:** `feat(branding): logo upload (auto-resize, SVG allowed)`

### Task 11.3: Controller + module + Swagger
Register module. **Commit:** `feat(branding): controller + module + Swagger`

---

## Phase 12 — Cross-cutting Finalize & Verification

### Task 12.1: Seed / reference data
> Q-01.01/02 placeholders. A `seed` script (`src/scripts/seed.ts` via `ts-node`): one SUPER_ADMIN (from env creds), the skill-level enum is already in schema. Seed a demo trainer + static ShareLink for manual testing. Document in `backend/README.md`.

**Commit:** `chore(db): seed script (super admin + demo trainer/sharelink)`

### Task 12.2: Tenant-isolation leakage tests (NFR-011) — the §2 "0% leakage" metric
> For **each** tenant-owned table, an integration test asserting trainer A cannot read/write trainer B's rows through the scoped path, AND that RLS blocks a raw query when the GUC is set to the wrong tenant.

**Files:** `test/tenant-isolation.e2e-spec.ts` (against dev DB). Seed two trainers + data; assert cross-reads return empty / throw. **Commit:** `test(tenancy): cross-tenant leakage tests for all tenant-owned tables`

### Task 12.3: E2E happy-path suites
> `test/jest-e2e.json` + Supertest. Cover the requirements' E2E list:
- **Auth:** register-via-join → (blocked unverified login) → verify → login → refresh → logout.
- **Users:** create trainer → invite → first login forces password change → change → access.
- **Family:** parent creates child → child requests purchase → parent approves / denies / 48h-expires.
- **ShareLinks:** player registers via link; existing user multi-trainer associate; coach invite single-use + expiry; coach single-trainer violation.
- **Impersonation:** impersonate → navigate → exit; cannot impersonate super admin.
- **Branding:** trainer brands → player resolves branding.

Use cookie jar (supertest agent) for the cookie/CSRF flow. **Commit:** `test(e2e): module happy-path + key error-path suites`

### Task 12.4: Swagger polish + README
> Ensure every controller has `@ApiTags`, cookie/csrf/active-context security schemes (api-spec §Swagger). Write `backend/README.md`: prerequisites, `docker compose up`, env, `db:generate/migrate`, RLS apply step, `start:dev`, `test`, Swagger URL. (Name any generated docs `coder-*.md` per coder skill if added.)

**Commit:** `docs(backend): README + Swagger polish`

### Task 12.5: Definition of Done sweep
Run the Standard tier from `.claude/DOD.md`:
- `npm test` (all green) · `npm run lint` (0 warnings) · `npm run build` (clean) · `npx tsc --noEmit`.
- `grep -rn "TODO\|FIXME\|HACK" src` → none unresolved.
- Manual OWASP pass: input validation at every boundary (global pipe), authz on every route (guard chain), no secrets committed, parameterized queries (Drizzle), rate-limited auth.

**Commit:** `chore: DoD verification for TASK-001 backend`

---

## Verification Matrix (requirement → where covered)

| Area | FR/BR/NFR | Phase / Task |
|------|-----------|--------------|
| Login + verification + status branches | FR-001/003/013 | 3.2, 3.3 |
| Password reset / forced change | FR-004/005 | 3.4 |
| Sessions: refresh rotation, logout | FR-006 | 2.5, 3.5 |
| Rate limiting | FR-007 | 2.12, 3.6 |
| RBAC | FR-008/BR-001 | 2.9 |
| CSRF | FR-009 | 2.7 |
| Super Admin CRUD + GDPR + soft delete | FR-010..014/BR-010 | 4.x |
| Impersonation + audit | FR-015/016/BR-009 | 10.x, 2.16 |
| ShareLink registration / associations | FR-017/018/028/033/BR-003/004/011 | 7.x |
| Context switching (separated views) | FR-019/027/BR-005 | 2.11, 6.x |
| Parent-child + approvals | FR-021..027/BR-006/007/008 | 8.x |
| Availability / override | FR-030/031/034/039/BR-012 | 9.x |
| Profiles + uploads | FR-038 | 5.x |
| Branding | FR-037 | 11.x |
| Multi-tenant isolation | NFR-011/BR-005 | 2.10, 2.11, 1.9, 12.2 |
| Hashing / token expiries / audit | NFR-006/007/008 | 2.5, 2.6, 2.16 |
| Keyset pagination perf | NFR-002 | 2.3, 4.1 |
| Camp conversion stub | FR-040 | 4.6 |

## Open flags carried from specs (surface to client; do not silently resolve)
- **Best Times scoping** (BR-007): built shared-per-child (P-4). Confirm before Phase 9. *(api-spec line 1030, brainstorm §9)*
- **Minor-login model** (P-5): children get constrained `User`. Confirm child-login is in scope. *(api-spec line 1031)*
- **Email template list** (Q-01.04): the 7 enumerated templates are inferred — confirm. *(2.13)*
- **Session TTL** (Q-01.07): refresh default 7d (config). *(0.1 env)*
- **Skill-level / age-group enums** (Q-01.01/02): placeholders. *(1.2)*

---

## Execution

**Plan complete and saved to `tasks/TASK-001/writing-plans-plan.md`.** Execution options:

1. **Isolated Workspace (recommended for an epic this size)** — `using-git-worktrees` to create an isolated backend worktree, then `coder` to implement phase-by-phase.
2. **Execute Now** — `coder` to implement directly in the current workspace.

Implement strictly in phase order (0→12); each phase assumes the prior compiles and its tests pass. Commit per task. If a phase's tests fail after 3 fix attempts, escalate to `systematic-debugger`.

---

## Next Steps

**Next by flow:** `/architect [TASK-001]` — sanity-check the locked decisions (P-1 trainerId key, P-4 Best Times scoping, P-5 minor-login, infra posture) before code, since they ripple across modules.

**Alternatives:**
- `/git-worktrees [TASK-001]` — create the isolated backend workspace for development.
- `/coder [TASK-001]` — start implementing Phase 0 in the current workspace.

**Context handoff:** "TASK-001: Epic-01 backend decomposed into a 13-phase plan (Phase 0 scaffold → 1 schema/RLS → 2 shared infra → 3–11 the eight modules + context → 12 finalize/e2e), ~70 bite-sized tasks with exact paths, complete foundation code, DTO references into api-designer-spec, TDD steps, and per-task commits. Locked decisions P-1..P-6 (trainerId=trainer_profiles.id, ShareLink-mediated registration, cookie-only tokens, shared-per-child Best Times, minor-login, local dev infra). 5 client flags carried forward."

