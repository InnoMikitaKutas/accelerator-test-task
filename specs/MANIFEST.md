# Project: Training Platform (working title)

A multi-tenant SaaS where independent trainers run their coaching businesses — managing
players, coaches, events, content, and payments — under one platform operated by a Super
Admin. Supports four roles (Super Admin, Trainer, Coach, Player/Parent) with complex
relationships: players train with multiple trainers (isolated per-trainer views), parents
manage children, and coaches are exclusive to one trainer. Delivered as 8 epics; Epic-01
(this task) is the foundation all others depend on.

## Specs Index

| File | Purpose | Depends On | Last Updated |
|------|---------|------------|--------------|
| architect-architecture.md | System design, components, data flow | - | 2026-05-29 (TASK-001, +ctx-switch refinement) |
| api-designer-spec.md | Endpoints, schemas, authentication | architect-architecture | - |
| frontend-design-spec.md | Pages, components, state management | architect-architecture, api-designer-spec | - |
| docs-generator-implementation.md | Build process, deployment, tooling | - | - |

## Key Decisions

- **Multi-tenancy**: single shared schema, `trainerId`-discriminated, association-scoped (forced by multi-trainer players). Isolation enforced by ScopedRepository + Postgres RLS backstop + leakage tests. *(TASK-001)*
- **Context switching**: multi-trainer player context = `(subjectProfileId, trainerId)` pair, sent per-request via an `X-Active-Context` header and server-authorized into `nestjs-cls`; three data zones (account-global / per-subject / per-context); no unified view. Supersedes the earlier JWT-claim sketch. *(TASK-001)*
- **Auth**: JWT access+refresh with rotation/reuse-detection, in httpOnly+SameSite cookies + CSRF double-submit. argon2id hashing. Email verification required before login. *(TASK-001)*
- **Async/timing**: BullMQ on Redis for timed expiries (approval 48h, impersonation 1h, tokens) + transactional outbox for cross-epic side effects. *(TASK-001)*
- **Minors**: all under-18 parent-managed (no independent minor accounts). *(TASK-001)*

## Tech Stack

- **Backend**: NestJS (Node + TypeScript), layered Controller→Service→Repository
- **Database**: PostgreSQL + **Drizzle ORM** (`drizzle-kit` migrations) + Row-Level Security
- **Cache/queue**: Redis + BullMQ; request context via `nestjs-cls`
- **Storage**: S3-compatible (MinIO dev) + `sharp` thumbnails
- **Email**: provider-agnostic `MailerService` + adapter
- **Security**: argon2id, `@nestjs/throttler`, `helmet`, `csrf-csrf`, `class-validator`

---

*This manifest is updated automatically by architect, api-designer, and frontend-design skills.*
*See `../spec-desc.md` for specification structure guidelines.*
