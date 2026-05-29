# API Specification

REST contract for the Training Platform. **Read `MANIFEST.md` first, then
`architect-architecture.md`** (tenancy, guard chain, CLS, RLS, cookie/CSRF model). This file
documents endpoints, DTOs (validation), responses, status codes, error codes, and Swagger
conventions. It does **not** restate architecture — FR/NFR/BR/entity IDs reference
`tasks/TASK-001/requirements-analyst-requirements.md`.

> **Design alignment (read once):**
> - **Layered, not CQRS.** Controllers call services directly (Controller → Service → Repository).
>   The api-designer skill's generic template shows `CommandBus`/`QueryBus`; this project does **not**
>   use CQRS (per architecture + requirements line 16/29). Ignore the CQRS template.
> - **Tokens live in httpOnly cookies, never response bodies.** Login/refresh set `Set-Cookie`;
>   no `accessToken` field is ever returned in JSON.
> - **IDs are UUID v4** (`ParseUUIDPipe`), not auto-increment integers — avoids IDOR/enumeration
>   across tenants and suits distributed Postgres. The skill's `ParseIntPipe` examples don't apply.
> - **All paths are versioned under `/api/v1`** (NestJS URI versioning).

---

## [TASK-001] Global Conventions (2026-05-29)

### Base URL & versioning

```
https://{host}/api/v1
```

URI versioning (`app.enableVersioning({ type: VersioningType.URI })`). All paths below omit the
`/api/v1` prefix for brevity.

### Authentication & session transport

| Aspect | Contract |
|--------|----------|
| Access token | JWT, **httpOnly + Secure + `SameSite=Strict` cookie** `at`, ~15 min TTL. |
| Refresh token | JWT, httpOnly cookie `rt`, config TTL (default 7d), rotation + reuse-detection. |
| Login/refresh response | Sets cookies via `Set-Cookie`. **Body never contains tokens.** |
| Logout | Clears both cookies + revokes refresh `jti` family. |
| CSRF | Double-submit cookie (`csrf-csrf`). State-changing requests (`POST/PUT/PATCH/DELETE`) MUST send header **`X-CSRF-Token`** matching the `csrf` cookie. Missing/invalid → `403 CSRF_INVALID`. |
| Active context | Scoped requests MUST send header **`X-Active-Context: <subjectProfileId>:<trainerId>`** (see Context Switching). |

### Guard chain (applied in this order)

`JwtAuthGuard → EmailVerifiedGuard → RolesGuard → TenantGuard → MinorAccountGuard`

Per-endpoint tables below name only the guards **beyond `JwtAuthGuard`** that matter (role
restriction, tenant/context requirement, minor restriction). `Public` marks endpoints with **no**
`JwtAuthGuard` (login, register-via-join, password reset, link resolution).

### Roles

`SUPER_ADMIN` · `TRAINER` · `COACH` · `PLAYER` (the `PLAYER` role covers both self-training adults
and parents; "parent" is a `PLAYER` who owns ≥1 child `PlayerProfile`). Exactly one role per user
(BR-001).

### Standard error envelope

Every non-2xx response uses NestJS's exception shape extended with a stable `errorCode`:

```jsonc
{
  "statusCode": 409,
  "error": "Conflict",                 // HTTP reason phrase
  "errorCode": "EMAIL_EXISTS",         // stable, client-switchable
  "message": "An account with this email already exists.",
  "details": [                          // present only for VALIDATION_ERROR
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

Clients branch on **`errorCode`**, never on `message` (message is i18n/UX-mutable).

### Error code catalog

| `errorCode` | HTTP | Meaning |
|-------------|------|---------|
| `VALIDATION_ERROR` | 400 | Body/query failed `class-validator` (`details[]` populated). |
| `INVALID_CREDENTIALS` | 401 | Login email/password mismatch (generic, no user enumeration). |
| `UNAUTHENTICATED` | 401 | Missing/expired access token. |
| `EMAIL_NOT_VERIFIED` | 403 | Login blocked pre-verification (D-1/FR-003); resend path offered. |
| `ACCOUNT_INACTIVE` | 403 | Soft-deleted/deactivated account login (FR-013). |
| `FORCE_PASSWORD_CHANGE` | 403 | Temp-password user must change before any other action (FR-005). |
| `FORBIDDEN_ROLE` | 403 | Role not permitted (RolesGuard, FR-008). |
| `CSRF_INVALID` | 403 | Missing/invalid CSRF token (FR-009). |
| `CONTEXT_FORBIDDEN` | 403 | Caller not entitled to the requested `X-Active-Context`. |
| `TENANT_FORBIDDEN` | 403 | Cross-tenant access attempt (NFR-011). |
| `MINOR_FORBIDDEN` | 403 | Action blocked by child CANNOT-matrix (FR-025/FR-026). |
| `IMPERSONATE_SUPER_ADMIN` | 403 | Attempt to impersonate a Super Admin (BR-009). |
| `NOT_FOUND` | 404 | Resource missing or not visible to caller. |
| `EMAIL_EXISTS` | 409 | Duplicate email (FR-002). |
| `COACH_ALREADY_ASSIGNED` | 409 | Coach already active under another trainer (BR-003/FR-029). |
| `DUPLICATE_CHILD_WARNING` | 409 | Same name+age child exists (BR-013, soft-warn; client may confirm-override). |
| `TOKEN_INVALID` | 410 | Verification/reset/invite token malformed or unknown. |
| `TOKEN_EXPIRED` | 410 | Token past expiry (verification 24h, reset 1h, coach invite 7d, impersonation 1h). |
| `TOKEN_USED` | 410 | Single-use token already consumed. |
| `SHARELINK_EXPIRED` | 410 | Unique/coach link past 7-day expiry. |
| `SHARELINK_USED` | 410 | Single-use link already consumed. |
| `CONTEXT_INACTIVE` | 410 | Association went inactive mid-session → client bounces to default. |
| `APPROVAL_EXPIRED` | 410 | Purchase approval past 48h auto-deny window (BR-008). |
| `FILE_TOO_LARGE` | 413 | Upload exceeds size cap (logo/photo ≤ 2 MB). |
| `UNSUPPORTED_FILE_TYPE` | 415 | Disallowed MIME (logo: PNG/JPG/SVG; photo: PNG/JPG). |
| `RATE_LIMITED` | 429 | Throttler tripped (auth endpoints, FR-007). `Retry-After` header set. |

### Pagination (keyset / cursor — NFR-002)

List endpoints use **opaque-cursor keyset pagination** (not offset) to hold 10k-row lists < 3s.

Request (query): `?limit=25&cursor=<opaque>&search=<term>&sort=<field:dir>` plus endpoint-specific
filters. Response:

```typescript
class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true }) items: T[];
  @ApiProperty({ nullable: true, description: 'Opaque cursor for the next page; null at end' })
  nextCursor: string | null;
  @ApiProperty() hasMore: boolean;
}
```

### Common request DTO base

```typescript
export class KeysetQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 25;

  @ApiPropertyOptional({ description: 'Opaque cursor from a prior page' })
  @IsOptional() @IsString()
  cursor?: string;
}
```

### Validation

Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. Unknown
properties → `400 VALIDATION_ERROR` (BR-013, AGENTS.md boundary-validation rule).

### Dates, money, files

- Timestamps: ISO-8601 UTC strings (`2026-05-29T14:00:00Z`).
- Money: integer **minor units** + ISO currency (`{ amount: 2500, currency: "USD" }`) — never floats.
- Uploads: `multipart/form-data`, field `file`, validated via `ParseFilePipe`
  (`MaxFileSizeValidator` 2 MB + `FileTypeValidator`). Stored via `StorageService`; response returns
  CDN/S3 URLs only.

---

## [TASK-001] Endpoint Index (2026-05-29)

| Module | Method & Path | Auth | Purpose | FR |
|--------|---------------|------|---------|-----|
| Auth | `POST /auth/login` | Public | Email/password login (sets cookies) | FR-001 |
| Auth | `POST /auth/logout` | JWT | Invalidate session | FR-006 |
| Auth | `POST /auth/refresh` | Cookie `rt` | Rotate tokens | FR-006 |
| Auth | `POST /auth/verify-email` | Public | Consume verification token | FR-003 |
| Auth | `POST /auth/resend-verification` | Public | Re-send verification email | FR-003 |
| Auth | `POST /auth/password/forgot` | Public | Request reset link | FR-004 |
| Auth | `POST /auth/password/reset` | Public | Complete reset | FR-004 |
| Auth | `POST /auth/password/change` | JWT | Change password / forced first-login change | FR-005 |
| Auth | `GET /auth/me` | JWT | Current session principal | FR-006/008 |
| Users | `GET /users` | SUPER_ADMIN | Global directory (keyset, search/filter) | FR-010 |
| Users | `POST /users` | SUPER_ADMIN | Create Trainer | FR-011 |
| Users | `GET /users/:id` | SUPER_ADMIN | Get user | FR-010 |
| Users | `PATCH /users/:id` | SUPER_ADMIN | Edit user | FR-012 |
| Users | `POST /users/:id/deactivate` | SUPER_ADMIN | Soft-delete | FR-013 |
| Users | `POST /users/:id/reactivate` | SUPER_ADMIN | Restore | FR-013 |
| Users | `DELETE /users/:id` | SUPER_ADMIN | GDPR anonymize-delete | FR-014 |
| Users | `POST /users/import/camp` | SUPER_ADMIN/TRAINER | Camp→User conversion stub (Epic-08) | FR-040 |
| Profiles | `GET /me/profile` | JWT | Own profile (role-shaped) | FR-038 |
| Profiles | `PATCH /me/profile` | JWT | Edit own profile | FR-038 |
| Profiles | `POST /me/profile/photo` | JWT | Upload avatar (+thumbnail) | FR-038 |
| Context | `GET /me/contexts` | JWT | Switcher data (subjects→trainers) | FR-019/027 |
| Context | `PUT /me/contexts/default` | JWT | Persist default context | FR-019 |
| ShareLinks | `POST /sharelinks` | TRAINER | Create static player link | FR-033 |
| ShareLinks | `GET /sharelinks` | TRAINER | List own links + invite statuses | FR-033 |
| ShareLinks | `DELETE /sharelinks/:id` | TRAINER | Deactivate a link | FR-033 |
| ShareLinks | `POST /sharelinks/coach-invite` | TRAINER | Unique single-use coach invite | FR-028/033 |
| ShareLinks | `GET /join/:code` | Public | Resolve a link (no PII) | FR-017/018/028 |
| ShareLinks | `POST /join/:code` | Public/JWT | Consume: register new OR associate existing | FR-017/018/028/029 |
| Family | `GET /family` | PLAYER | Roster: self + children + associations | FR-027 |
| Family | `POST /family/children` | PLAYER | Create child profile | FR-021 |
| Family | `GET /family/children/:id` | PLAYER | Get child | FR-021 |
| Family | `PATCH /family/children/:id` | PLAYER | Edit child | FR-021 |
| Family | `POST /family/children/:id/trainers` | PLAYER | Add child↔trainer association | FR-023 |
| Family | `DELETE /family/children/:id/trainers/:trainerId` | PLAYER | Remove association (soft + RSVP cancel) | FR-023 |
| Family | `PUT /family/children/:id/token-setting` | PLAYER | Per-child token-approval toggle | FR-024 |
| Family | `POST /family/purchase-requests` | PLAYER (child) | Child-initiated purchase → approval | FR-024 |
| Family | `GET /family/approvals` | PLAYER | Pending/historic approvals | FR-024 |
| Family | `GET /family/approvals/:id` | PLAYER | Approval detail | FR-024 |
| Family | `POST /family/approvals/:id/approve` | PLAYER (parent) | Approve | FR-024 |
| Family | `POST /family/approvals/:id/deny` | PLAYER (parent) | Deny | FR-024 |
| Availability | `GET /availability/:subjectType/:subjectId` | JWT | Read Best/My Times | FR-030/039 |
| Availability | `PUT /availability/:subjectType/:subjectId` | JWT | Replace slots | FR-030/039 |
| Availability | `GET /trainer/availability` | TRAINER | View+filter player Best Times | FR-034 |
| Availability | `POST /availability/overrides` | TRAINER | Override coach conflict w/ reason | FR-031 |
| Impersonation | `POST /impersonate/:userId` | SUPER_ADMIN | Start impersonation | FR-015 |
| Impersonation | `POST /impersonate/exit` | JWT (impersonating) | End impersonation | FR-015 |
| Impersonation | `GET /impersonation/history` | SUPER_ADMIN | Audit log report | FR-016 |
| Branding | `GET /trainer/branding` | TRAINER | Own org branding | FR-037 |
| Branding | `PUT /trainer/branding` | TRAINER | Set primary color | FR-037 |
| Branding | `POST /trainer/branding/logo` | TRAINER | Upload logo (auto-resize) | FR-037 |
| Branding | `GET /branding/:trainerId` | JWT | Resolve org branding for display | FR-037 |

---

## [TASK-001] Module A — Auth (`/auth`)

Guards: most endpoints are `Public`; `/auth/me`, `/logout`, `/password/change` require `JwtAuthGuard`.
`@nestjs/throttler` (Redis) on **all** `/auth/*` (FR-007): stricter limit on `login`,
`password/forgot`, `resend-verification` (e.g. 5/min/IP+email). CSRF applies to all POSTs.

> **Registration is ShareLink-mediated — by design.** There is **no open `POST /auth/register`.**
> BR-002 forbids trainer self-registration; FR-017 routes player/parent sign-up through a static
> ShareLink; FR-028 routes coaches through a unique invite. The atomic "create User + profile +
> association" transaction (architecture §Transaction Boundaries) therefore lives at
> **`POST /join/:code`** (Module D). Trainers are created by Super Admin (`POST /users`). This
> deviates from the raw task-list bullet "`POST /auth/register`" and is the correct contract.

### DTOs

```typescript
export class LoginDto {
  @ApiProperty({ example: 'coach@club.com' }) @IsEmail() @MaxLength(255) email: string;
  @ApiProperty({ example: 'P@ssw0rd!' })       @IsString() @MaxLength(128) password: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Opaque token from the verification email' })
  @IsString() @Length(20, 256) token: string;
}

export class ResendVerificationDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
}

export class ForgotPasswordDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @Length(20, 256) token: string;
  @ApiProperty({ minLength: 8, description: 'Min 8 chars, ≥1 letter & ≥1 number' })
  @IsString() @MinLength(8) @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password must contain a letter and a number' })
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ description: 'Required unless mustChangePassword (temp-password) flow' })
  @ValidateIf((o) => !o.fromTempPassword) @IsString() currentPassword?: string;
  @ApiProperty({ minLength: 8 })
  @IsString() @MinLength(8) @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/) newPassword: string;
}

// Response — NO tokens (cookies carry them)
export class SessionUserDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['SUPER_ADMIN','TRAINER','COACH','PLAYER'] }) role: Role;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty({ description: 'Temp-password users must change before proceeding' })
  mustChangePassword: boolean;
  @ApiPropertyOptional({ type: () => ContextRefDto, nullable: true,
    description: "Seed for the client's initial context (PLAYER only)" })
  defaultContext?: ContextRefDto | null;
}
```

### [TASK-001] POST /auth/login
- **Auth:** Public · throttled.
- **Request:** `LoginDto`. **Response 200:** `SessionUserDto` + `Set-Cookie: at, rt, csrf`.
- **Errors:** `401 INVALID_CREDENTIALS` · `403 EMAIL_NOT_VERIFIED` (body adds `{ canResend: true }`) ·
  `403 ACCOUNT_INACTIVE` · `429 RATE_LIMITED`.
- **Notes:** Success with a temp password still returns 200 with `mustChangePassword:true`; all other
  endpoints then return `403 FORCE_PASSWORD_CHANGE` until `/auth/password/change` succeeds (FR-005).

### [TASK-001] POST /auth/logout
- **Auth:** JWT. **Response 204.** Clears cookies, revokes refresh `jti` family.

### [TASK-001] POST /auth/refresh
- **Auth:** valid `rt` cookie (no access token needed). **Response 204** + rotated `Set-Cookie`.
- **Errors:** `401 UNAUTHENTICATED` (missing/expired `rt`). Reuse of a rotated token revokes the
  whole family and returns 401 (architecture §Auth).

### [TASK-001] POST /auth/verify-email
- **Auth:** Public. **Request:** `VerifyEmailDto`. **Response 200** `{ verified: true }`.
- **Errors:** `410 TOKEN_INVALID | TOKEN_EXPIRED | TOKEN_USED`.

### [TASK-001] POST /auth/resend-verification
- **Auth:** Public · throttled. **Request:** `ResendVerificationDto`. **Response 202** (always —
  no account enumeration; sends only if an unverified account exists).

### [TASK-001] POST /auth/password/forgot
- **Auth:** Public · throttled. **Request:** `ForgotPasswordDto`. **Response 202** (always 202).
- **Notes:** Reset link expires 1h, single-use (NFR-007).

### [TASK-001] POST /auth/password/reset
- **Auth:** Public. **Request:** `ResetPasswordDto`. **Response 200** `{ reset: true }`.
- **Errors:** `410 TOKEN_INVALID | TOKEN_EXPIRED | TOKEN_USED` · `400 VALIDATION_ERROR`.

### [TASK-001] POST /auth/password/change
- **Auth:** JWT (allowed even under `FORCE_PASSWORD_CHANGE`). **Request:** `ChangePasswordDto`.
  **Response 204** + rotates session (re-issues cookies, revokes old refresh family).
- **Errors:** `401 INVALID_CREDENTIALS` (wrong `currentPassword`) · `400 VALIDATION_ERROR`.

### [TASK-001] GET /auth/me
- **Auth:** JWT. **Response 200:** `SessionUserDto` (includes `impersonatedBy` when applicable, see
  Module G).

---

## [TASK-001] Module B — Users / Super Admin (`/users`)

Guards: `RolesGuard(SUPER_ADMIN)` on all (cross-tenant by design — Super Admin spans tenants via
elevated/`BYPASSRLS` context). No `X-Active-Context` required.

### DTOs

```typescript
export class CreateTrainerDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) firstName: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) lastName: string;
  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional() @IsPhoneNumber(null) phone?: string;
  @ApiProperty({ description: 'Trainer business / organization name' })
  @IsNotEmpty() @MaxLength(200) businessName: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(500) businessAddress?: string;
  @ApiPropertyOptional({ default: 'INVITE', enum: ['INVITE','TEMP_PASSWORD'],
    description: 'Onboarding mode: emailed invite link or admin-set temp password (FR-005)' })
  @IsOptional() @IsEnum(['INVITE','TEMP_PASSWORD']) onboardingMode?: 'INVITE' | 'TEMP_PASSWORD';
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber(null) phone?: string;
  // email & role are immutable here (FR-038 read-only rule); change-email is a separate flow.
}

export class UserListQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional({ description: 'Free-text on name/email' })
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @ApiPropertyOptional({ enum: ['SUPER_ADMIN','TRAINER','COACH','PLAYER'] })
  @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({ enum: ['ACTIVE','INACTIVE','DELETED'] })
  @IsOptional() @IsEnum(['ACTIVE','INACTIVE','DELETED']) status?: UserStatus;
  @ApiPropertyOptional({ description: 'Tool-specific: filter players/coaches under a trainer org' })
  @IsOptional() @IsUUID() trainerId?: string;
  @ApiPropertyOptional({ enum: ['createdAt:desc','createdAt:asc','lastLoginAt:desc'] })
  @IsOptional() @IsString() sort?: string;
}

export class DeactivateUserDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(500) reason?: string;
}

export class GdprDeleteDto {
  @ApiProperty({ description: 'Required justification — written to UserDeletionLog' })
  @IsNotEmpty() @MaxLength(500) reason: string;
  @ApiProperty({ description: 'Must equal the target email — confirms intent (irreversible)' })
  @IsEmail() confirmEmail: string;
}

export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;          // "deleted-user-<uuid>@anon.invalid" after GDPR delete
  @ApiProperty() firstName: string;       // "Deleted" after GDPR delete
  @ApiProperty() lastName: string;        // "User"
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty({ enum: ['ACTIVE','INACTIVE','DELETED'] }) status: UserStatus;
  @ApiProperty() emailVerified: boolean;
  @ApiPropertyOptional({ nullable: true }) lastLoginAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiPropertyOptional({ description: 'Trainer org(s) this user belongs to / is associated with' })
  trainerIds?: string[];
}
```

### [TASK-001] GET /users
- **Request:** `UserListQueryDto` (query). **Response 200:** `PaginatedResponseDto<UserResponseDto>`.
- **Perf:** keyset pagination; backed by `users(email)` + composite status/role indexes (NFR-002).

### [TASK-001] POST /users
- **Request:** `CreateTrainerDto`. **Response 201:** `UserResponseDto` (status `ACTIVE`).
- **Side effect:** issues invite email **or** temp password (outbox→BullMQ). **Errors:**
  `409 EMAIL_EXISTS` · `400 VALIDATION_ERROR`.

### [TASK-001] GET /users/:id
- **Param:** `id` UUID. **Response 200** `UserResponseDto`. **Errors:** `404 NOT_FOUND`.

### [TASK-001] PATCH /users/:id
- **Request:** `UpdateUserDto`. **Response 200** `UserResponseDto`. **Errors:** `404 NOT_FOUND`.

### [TASK-001] POST /users/:id/deactivate
- **Request:** `DeactivateUserDto`. **Response 200** `UserResponseDto` (status `INACTIVE`).
- **Notes:** Soft delete — history preserved, login blocked (`ACCOUNT_INACTIVE`), reversible (FR-013/BR-010).

### [TASK-001] POST /users/:id/reactivate
- **Response 200** `UserResponseDto` (status `ACTIVE`). **Errors:** `404 NOT_FOUND`.

### [TASK-001] DELETE /users/:id
- **Request:** `GdprDeleteDto` (body required — irreversible, so confirm-email guard). **Response 200:**

```typescript
class GdprDeleteResultDto {
  @ApiProperty() anonymized: boolean;
  @ApiProperty() deletionLogId: string;          // UserDeletionLog ref
  @ApiProperty({ description: 'Analytics rows retained; render as "Deleted User"' })
  historyRetained: true;
}
```
- **Notes:** 1-tx anonymize PII + write `UserDeletionLog`; analytics totals unchanged; audited
  (FR-014/BR-010/NFR-008). **Errors:** `404 NOT_FOUND` · `400 VALIDATION_ERROR` (confirmEmail mismatch).

### [TASK-001] POST /users/import/camp
- **Auth:** `SUPER_ADMIN` or `TRAINER`. **Contract stub — full flow owned by Epic-08 (FR-040).**
- **Request:**
```typescript
class CampConversionDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsNotEmpty() firstName: string;
  @ApiProperty() @IsNotEmpty() lastName: string;
  @ApiProperty({ description: 'Trainer to auto-associate the converted user with' })
  @IsUUID() trainerId: string;
  @ApiPropertyOptional({ type: Object, description: 'Opaque camp pre-fill payload (Epic-08 schema)' })
  @IsOptional() @IsObject() prefill?: Record<string, unknown>;
}
```
- **Response 201:** `{ userId, created: boolean, associated: boolean }`. Documented here only as the
  boundary contract; implementation lands in Epic-08.

---

## [TASK-001] Module C — Profiles (`/me/profile`)

Guards: `JwtAuthGuard` only (self-service). The response/request **shape is discriminated by the
caller's role**. `email`, `role`, and `skillLevel` are **read-only** (FR-038) — present in responses,
rejected (whitelist) in update bodies.

### DTOs

```typescript
// Update bodies — one per role; server selects validator by session role.
export class UpdateTrainerProfileDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber(null) phone?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(200) businessName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(500) businessAddress?: string;
}

export class UpdateCoachProfileDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber(null) phone?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @MaxLength(2000) bio?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  credentials?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  certifications?: string[];
  @ApiPropertyOptional({ description: 'Public-profile visibility toggle (FR-032)' })
  @IsOptional() @IsBoolean() publicVisible?: boolean;
}

export class UpdatePlayerProfileDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber(null) phone?: string;
  @ApiPropertyOptional({ enum: ['MALE','FEMALE','OTHER','UNSPECIFIED'] })
  @IsOptional() @IsEnum(['MALE','FEMALE','OTHER','UNSPECIFIED']) gender?: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(200) school?: string;
  @ApiPropertyOptional({ description: 'Emergency contact (name + phone)' })
  @IsOptional() @ValidateNested() @Type(() => EmergencyContactDto) emergencyContact?: EmergencyContactDto;
  // skillLevel intentionally absent — read-only (FR-038).
}

export class EmergencyContactDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty() @IsPhoneNumber(null) phone: string;
}

// Response — role-discriminated union (Swagger: @ApiExtraModels + oneOf)
export class ProfileResponseDto {
  @ApiProperty() id: string;                 // User id
  @ApiProperty({ enum: Role }) role: Role;
  @ApiProperty() email: string;              // read-only
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) photoUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) thumbnailUrl: string | null;
  @ApiProperty({ description: 'Role-specific block: trainer | coach | player' })
  details: TrainerDetails | CoachDetails | PlayerDetails;
}
```

### [TASK-001] GET /me/profile
- **Response 200:** `ProfileResponseDto` (role-shaped `details`). For a parent, `details` is the
  **self** PlayerProfile; children are fetched via `GET /family`.

### [TASK-001] PATCH /me/profile
- **Request:** role-matched `Update*ProfileDto` (server picks by session role). **Response 200**
  `ProfileResponseDto`. **Errors:** `400 VALIDATION_ERROR` (incl. attempt to set read-only `email`/
  `role`/`skillLevel` → rejected by whitelist).

### [TASK-001] POST /me/profile/photo
- **Request:** `multipart/form-data`, field `file` (PNG/JPG, ≤ 2 MB). **Response 200:**
  `{ photoUrl, thumbnailUrl }` (sharp thumbnail generated async; URL returned once ready).
- **Errors:** `413 FILE_TOO_LARGE` · `415 UNSUPPORTED_FILE_TYPE`.

---

## [TASK-001] Context Switching (`/me/contexts`)

Implements FR-019/FR-027 per `tasks/TASK-001/brainstorming-separated-views-design.md`. The active
context is **not** in the JWT — it travels per request via `X-Active-Context` and is authorized by
`TenantGuard`. These two endpoints feed and persist the switcher.

### DTOs

```typescript
export class ContextRefDto {
  @ApiProperty() subjectProfileId: string;
  @ApiProperty() trainerId: string;
}

export class TrainerChannelDto {
  @ApiProperty() trainerId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['active','inactive'] }) status: 'active' | 'inactive';
}

export class SubjectDto {
  @ApiProperty() profileId: string;
  @ApiProperty() displayName: string;
  @ApiProperty() isSelf: boolean;
  @ApiProperty() isChild: boolean;
  @ApiProperty({ type: [TrainerChannelDto] }) trainers: TrainerChannelDto[];
}

export class ContextsResponseDto {
  @ApiProperty({ type: [SubjectDto] }) subjects: SubjectDto[];
  @ApiPropertyOptional({ type: ContextRefDto, nullable: true }) defaultContext: ContextRefDto | null;
}

export class SetDefaultContextDto {
  @ApiProperty() @IsUUID() subjectProfileId: string;
  @ApiProperty() @IsUUID() trainerId: string;
}
```

### [TASK-001] GET /me/contexts
- **Auth:** JWT. **Response 200:** `ContextsResponseDto`. Drives the subject switcher + trainer tabs.
  Single subject + single trainer ⇒ client renders no switcher (progressive disclosure).

### [TASK-001] PUT /me/contexts/default
- **Auth:** JWT. **Request:** `SetDefaultContextDto`. **Response 204.** Persists the per-user default
  used to seed fresh logins. **Errors:** `403 CONTEXT_FORBIDDEN` (subject/association not the caller's).

> **Header contract — `X-Active-Context: <subjectProfileId>:<trainerId>`** (validated by `TenantGuard`
> on every Zone-3 / subject-scoped request across other modules):
> - `403 CONTEXT_FORBIDDEN` — subject not owned by caller, or association not active.
> - `410 CONTEXT_INACTIVE` — association went inactive mid-session → client bounces to default.
> - Missing header on a context-scoped endpoint → `400 VALIDATION_ERROR` (`{ field: "X-Active-Context" }`).

---

## [TASK-001] Module D — ShareLinks & Associations (`/sharelinks`, `/join`)

Static links: unlimited uses, no expiry (players). Unique coach invites: single-use, 7-day expiry
(BR-011). `/join/*` is the public registration + association surface. `/sharelinks/*` is trainer-only
management (`RolesGuard(TRAINER)` + `TenantGuard`).

### DTOs

```typescript
export class CreateShareLinkDto {
  @ApiPropertyOptional({ description: 'Optional human label for the trainer dashboard' })
  @IsOptional() @MaxLength(120) label?: string;
}

export class CoachInviteDto {
  @ApiProperty({ description: 'Coach email the invite is bound to' })
  @IsEmail() @MaxLength(255) email: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(120) personalNote?: string;
}

export class ShareLinkResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['static','unique'] }) type: 'static' | 'unique';
  @ApiProperty({ description: 'Shareable URL, e.g. https://app/join/AB12CD' }) url: string;
  @ApiProperty() code: string;
  @ApiPropertyOptional({ nullable: true }) targetEmail: string | null;     // coach invites
  @ApiPropertyOptional({ nullable: true }) expiresAt: string | null;       // null for static
  @ApiProperty() useCount: number;
  @ApiPropertyOptional({ nullable: true }) maxUses: number | null;         // 1 for unique, null static
  @ApiProperty({ enum: ['PENDING','ACCEPTED','EXPIRED','REVOKED','ACTIVE'] }) status: string;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: string;
}

// Public resolution — deliberately minimal, no PII beyond trainer display name + branding.
export class JoinResolveDto {
  @ApiProperty() code: string;
  @ApiProperty({ enum: ['static','unique'] }) type: 'static' | 'unique';
  @ApiProperty({ enum: ['VALID','EXPIRED','USED','INVALID'] }) status: string;
  @ApiProperty() trainerDisplayName: string;
  @ApiPropertyOptional({ type: () => BrandingResponseDto, nullable: true }) branding: BrandingResponseDto | null;
  @ApiProperty({ description: 'true ⇒ caller must register (no session)' }) requiresAccount: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'Email a coach invite is bound to (read-only)' })
  prefillEmail: string | null;
}

// Consume — new-user registration branch (unauthenticated)
export class JoinRegisterDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;            // ignored/validated == prefill for coach links
  @ApiProperty({ minLength: 8 })
  @IsString() @MinLength(8) @MaxLength(128) @Matches(/(?=.*[A-Za-z])(?=.*\d)/) password: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) firstName: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) lastName: string;
  @ApiPropertyOptional() @IsOptional() @IsPhoneNumber(null) phone?: string;
}

// Consume — existing-user association branch (authenticated). Body optional.
export class JoinAssociateDto {
  @ApiPropertyOptional({ description: 'Which owned subject to associate (defaults to self)' })
  @IsOptional() @IsUUID() subjectProfileId?: string;
}
```

### [TASK-001] POST /sharelinks
- **Auth:** TRAINER. **Request:** `CreateShareLinkDto`. **Response 201:** `ShareLinkResponseDto`
  (`type:'static'`, no expiry, unlimited uses).

### [TASK-001] GET /sharelinks
- **Auth:** TRAINER. **Request:** `KeysetQueryDto` + `?type=&status=`. **Response 200:**
  `PaginatedResponseDto<ShareLinkResponseDto>` (includes coach-invite statuses Pending/Accepted/Expired).

### [TASK-001] DELETE /sharelinks/:id
- **Auth:** TRAINER (own link only — `TenantGuard`). **Response 204** (sets `active:false`).
  **Errors:** `404 NOT_FOUND` · `403 TENANT_FORBIDDEN`.

### [TASK-001] POST /sharelinks/coach-invite
- **Auth:** TRAINER. **Request:** `CoachInviteDto`. **Response 201:** `ShareLinkResponseDto`
  (`type:'unique'`, `maxUses:1`, `expiresAt:+7d`, `status:'PENDING'`). Sends coach-invite email.

### [TASK-001] GET /join/:code
- **Auth:** Public. **Response 200:** `JoinResolveDto`. Never 404s on expired/used — returns
  `status` so the landing page can explain. Truly unknown code ⇒ `status:'INVALID'`.

### [TASK-001] POST /join/:code
- **Auth:** Public **or** JWT (two branches).
- **Branch 1 — new user (no session):** Request `JoinRegisterDto`. **Response 201:** `SessionUserDto`
  + `Set-Cookie` (logged in). **1 tx:** create `User` + role profile + `Trainer*Association` +
  increment usage (architecture §Tx Boundaries). Static link ⇒ `PLAYER`; coach invite ⇒ `COACH`
  (with single-trainer guard).
- **Branch 2 — existing user (JWT):** Request `JoinAssociateDto`. **Response 201:**
  `{ association: { trainerId, subjectProfileId, status:'active' }, context: ContextRefDto }`.
  No new account (FR-018); new context appears in switcher.
- **Errors:** `410 SHARELINK_EXPIRED | SHARELINK_USED` · `404 NOT_FOUND` (invalid code) ·
  `409 EMAIL_EXISTS` (new-user branch, email already registered → prompt to log in & associate) ·
  `409 COACH_ALREADY_ASSIGNED` (coach invite, BR-003/FR-029) ·
  `403 MINOR_FORBIDDEN` (a logged-in child consuming a **new-trainer** link — blocked; parent emailed
  a register-CTA, FR-026) · `400 VALIDATION_ERROR` (coach link: `email` ≠ `prefillEmail`).

---

## [TASK-001] Module E — Family / Parent-Child (`/family`)

Guards: `RolesGuard(PLAYER)`. Parent-only mutations additionally blocked for child sessions by
`MinorAccountGuard` (FR-025). Children, associations, and approvals are **Zone-1 (account-global)** —
they do **not** take `X-Active-Context`.

### DTOs

```typescript
export class CreateChildDto {
  @ApiProperty() @IsNotEmpty() @MaxLength(100) firstName: string;
  @ApiProperty() @IsNotEmpty() @MaxLength(100) lastName: string;
  @ApiProperty({ minimum: 1, maximum: 18, description: 'All under-18 are parent-managed (BR-006)' })
  @IsInt() @Min(1) @Max(18) age: number;
  @ApiProperty({ enum: ['MALE','FEMALE','OTHER','UNSPECIFIED'] })
  @IsEnum(['MALE','FEMALE','OTHER','UNSPECIFIED']) gender: string;
  @ApiPropertyOptional() @IsOptional() @MaxLength(200) school?: string;
  @ApiPropertyOptional({ description: 'Acknowledge the duplicate-name+age warning and proceed' })
  @IsOptional() @IsBoolean() confirmDuplicate?: boolean;
}

export class UpdateChildDto extends PartialType(OmitType(CreateChildDto, ['confirmDuplicate'] as const)) {}

export class ChildTrainerAssocDto {
  @ApiPropertyOptional({ description: 'Associate via a ShareLink code…' })
  @ValidateIf((o) => !o.trainerId) @IsString() code?: string;
  @ApiPropertyOptional({ description: '…or directly by trainerId (one of code|trainerId required)' })
  @ValidateIf((o) => !o.code) @IsUUID() trainerId?: string;
}

export class TokenSettingDto {
  @ApiProperty({ description: 'true ⇒ tokens may be spent without parent approval (default false)' })
  @IsBoolean() allowTokenWithoutApproval: boolean;
}

export class PurchaseRequestDto {
  @ApiProperty() @IsUUID() childProfileId: string;
  @ApiProperty({ description: 'Event/item reference (resolved in Epic-02/05)' })
  @IsString() @MaxLength(120) itemRef: string;
  @ApiProperty({ enum: ['USD','TOKEN'] }) @IsEnum(['USD','TOKEN']) paymentType: 'USD' | 'TOKEN';
  @ApiPropertyOptional({ description: 'Minor units; required when paymentType=USD' })
  @ValidateIf((o) => o.paymentType === 'USD') @IsInt() @Min(0) amount?: number;
  @ApiPropertyOptional() @IsOptional() @MaxLength(280) childNote?: string;
}

export class ApprovalDecisionDto {
  @ApiPropertyOptional() @IsOptional() @MaxLength(280) parentNote?: string;
}

export class ApprovalResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() childProfileId: string;
  @ApiProperty() childDisplayName: string;
  @ApiProperty() trainerId: string;
  @ApiProperty() itemRef: string;
  @ApiProperty({ enum: ['USD','TOKEN'] }) paymentType: string;
  @ApiPropertyOptional({ nullable: true }) amount: number | null;
  @ApiProperty({ enum: ['PENDING','APPROVED','DENIED','EXPIRED'] }) status: string;
  @ApiProperty() requestedAt: string;
  @ApiProperty({ description: '48h after requestedAt (BR-008)' }) expiresAt: string;
  @ApiPropertyOptional({ nullable: true }) respondedAt: string | null;
  @ApiPropertyOptional({ nullable: true }) parentNote: string | null;
}

export class FamilyResponseDto {
  @ApiProperty({ type: () => PlayerProfileSummaryDto }) self: PlayerProfileSummaryDto;
  @ApiProperty({ type: [Object], description: 'Children with their trainer associations + token setting' })
  children: ChildSummaryDto[];
  @ApiProperty({ description: 'Count of PENDING approvals across all children' }) pendingApprovals: number;
}
```

### [TASK-001] GET /family
- **Auth:** PLAYER (parent). **Response 200:** `FamilyResponseDto`. The Zone-1 roster. Child sessions
  ⇒ `403 MINOR_FORBIDDEN`.

### [TASK-001] POST /family/children
- **Request:** `CreateChildDto`. **Response 201:** `ChildSummaryDto`.
- **Errors:** `409 DUPLICATE_CHILD_WARNING` (same name+age; resend with `confirmDuplicate:true`) ·
  `400 VALIDATION_ERROR` (age out of 1–18).

### [TASK-001] GET /family/children/:id  ·  PATCH /family/children/:id
- **GET 200 / PATCH 200:** `ChildSummaryDto`. **PATCH Request:** `UpdateChildDto`. Owner-only.
  **Errors:** `404 NOT_FOUND` · `403 TENANT_FORBIDDEN` (not the caller's child).

### [TASK-001] POST /family/children/:id/trainers
- **Request:** `ChildTrainerAssocDto` (one of `code` | `trainerId`). **Response 201:**
  `{ trainerId, subjectProfileId, status:'active' }`. Creates a `TrainerPlayerAssociation` for the
  child — a new **context** for that child appears in the switcher.
- **Errors:** `409 EMAIL_EXISTS`/already-associated → idempotent `200` with existing link ·
  `410 SHARELINK_*` (when via `code`) · `404 NOT_FOUND`.

### [TASK-001] DELETE /family/children/:id/trainers/:trainerId
- **Response 204.** **1 tx:** soft-delete the association + cascade child-with-trainer data;
  **RSVP cancellation emitted via outbox** (cross-epic, Epic-02 — not in-tx). **Errors:** `404 NOT_FOUND`.

### [TASK-001] PUT /family/children/:id/token-setting
- **Request:** `TokenSettingDto`. **Response 200:** `{ childProfileId, allowTokenWithoutApproval }`.
  Per-child toggle; default requires approval (BR-008).

### [TASK-001] POST /family/purchase-requests
- **Auth:** PLAYER (child session typically — `MinorAccountGuard` permits *requesting*, not spending).
  **Request:** `PurchaseRequestDto`. **Response 201:** `ApprovalResponseDto` (`status:'PENDING'`,
  `expiresAt:+48h`). USD **always** requires approval; TOKEN obeys the child's `token-setting` (may
  auto-approve). **Side effect:** parent email + in-app notify (Zone-1 bell). Payment **execution** is
  Epic-05 (this only records the approval).

### [TASK-001] GET /family/approvals
- **Request:** `KeysetQueryDto` + `?status=PENDING|APPROVED|DENIED|EXPIRED&childProfileId=`.
  **Response 200:** `PaginatedResponseDto<ApprovalResponseDto>`.

### [TASK-001] GET /family/approvals/:id
- **Response 200:** `ApprovalResponseDto`. **Errors:** `404 NOT_FOUND`.

### [TASK-001] POST /family/approvals/:id/approve  ·  /deny
- **Auth:** PLAYER **parent** (child ⇒ `403 MINOR_FORBIDDEN`). **Request:** `ApprovalDecisionDto`.
  **Response 200:** `ApprovalResponseDto` (`APPROVED`/`DENIED`). **Errors:** `410 APPROVAL_EXPIRED`
  (past 48h — BullMQ already auto-denied) · `409` (already decided) · `404 NOT_FOUND`.

---

## [TASK-001] Module F — Availability / Best Times (`/availability`, `/trainer/availability`)

`subjectType ∈ {player, coach}`. Players/parents set **Best Times** per subject; coaches set
**My Times** (recurring weekly, multiple slots/day). Trainers read player availability + filter.

> **⚠️ Flagged decision (confirm with client before building `availability/`).** Best Times = **one
> shared schedule per child** — `Availability` keys on `subjectId` with **no `trainerId`** (Zone-2).
> A strict reading of BR-007 ("independent Best-Times per trainer") would make it per-coach, adding
> `trainerId` and moving it to Zone-3 (then these endpoints would also require `X-Active-Context`).
> Spec below reflects the **shared-per-child** decision (architecture §Entity Relationships).

### DTOs

```typescript
export class TimeSlotDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0=Sunday … 6=Saturday' })
  @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @ApiProperty({ example: '09:00', description: 'HH:mm 24h, local to the org/user TZ' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime: string;
  @ApiProperty({ example: '11:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime: string;
}

export class SetAvailabilityDto {
  @ApiProperty({ type: [TimeSlotDto], description: 'Full replacement set (PUT semantics)' })
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => TimeSlotDto)
  slots: TimeSlotDto[];
  // server validates start < end and rejects overlapping slots on the same day → VALIDATION_ERROR
}

export class AvailabilityResponseDto {
  @ApiProperty({ enum: ['player','coach'] }) subjectType: 'player' | 'coach';
  @ApiProperty() subjectId: string;
  @ApiProperty({ type: [TimeSlotDto] }) slots: TimeSlotDto[];
  @ApiProperty() updatedAt: string;
}

export class TrainerAvailabilityQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 6 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6)
  dayOfWeek?: number;
  @ApiPropertyOptional({ example: '17:00', description: 'Filter players available at/after this time' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) availableAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;     // player name
}

export class OverrideDto {
  @ApiProperty({ description: 'Event the coach is being assigned to (linkage owned by Epic-02)' })
  @IsUUID() eventId: string;
  @ApiProperty() @IsUUID() coachId: string;
  @ApiProperty({ description: 'Required reason — logged to AvailabilityOverride (FR-031)' })
  @IsNotEmpty() @MaxLength(500) reason: string;
}
```

### [TASK-001] GET /availability/:subjectType/:subjectId
- **Auth:** JWT (owner: own coach profile, or a player profile the caller owns/parents; or a TRAINER
  associated with the subject). **Response 200:** `AvailabilityResponseDto`. **Errors:**
  `403 TENANT_FORBIDDEN` · `404 NOT_FOUND`.

### [TASK-001] PUT /availability/:subjectType/:subjectId
- **Auth:** owner only (coach for self `coach`; parent/self for `player`). **Request:**
  `SetAvailabilityDto` (full replace). **Response 200:** `AvailabilityResponseDto`. **Errors:**
  `400 VALIDATION_ERROR` (overlap / start≥end) · `403 TENANT_FORBIDDEN`.

### [TASK-001] GET /trainer/availability
- **Auth:** TRAINER + `TenantGuard`. **Request:** `TrainerAvailabilityQueryDto`. **Response 200:**
  `PaginatedResponseDto<{ playerProfileId, displayName, slots: TimeSlotDto[] }>` — players associated
  with the trainer, filtered by day/time (FR-034). Advisory only (BR-012).

### [TASK-001] POST /availability/overrides
- **Auth:** TRAINER + `TenantGuard`. **Request:** `OverrideDto`. **Response 201:**
  `{ id, eventId, coachId, overriddenBy, reason, createdAt }`. Logs the override; optional coach
  notification (Q-01.06, toggle). Event linkage validated in Epic-02 — contract exposed here (FR-035).

---

## [TASK-001] Module G — Impersonation (`/impersonate`, `/impersonation`)

Guards: start/history are `RolesGuard(SUPER_ADMIN)`. While impersonating, the session carries
`impersonatorAdminId`; every action is attributed to the admin in `AuditLog` (NFR-008). 1h hard
expiry via claim + BullMQ revoke (NFR-007).

### DTOs

```typescript
export class StartImpersonationDto {
  @ApiPropertyOptional({ description: 'Support reason — written to ImpersonationLog' })
  @IsOptional() @MaxLength(500) reason?: string;
}

export class ImpersonationStateDto {
  @ApiProperty() impersonating: boolean;
  @ApiPropertyOptional({ nullable: true }) targetUserId: string | null;
  @ApiPropertyOptional({ nullable: true }) targetDisplayName: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Hard expiry (1h)' }) expiresAt: string | null;
}

export class ImpersonationHistoryQueryDto extends KeysetQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() adminId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() targetUserId?: string;
  @ApiPropertyOptional({ description: 'ISO date lower bound' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

export class ImpersonationLogDto {
  @ApiProperty() id: string;
  @ApiProperty() adminId: string;
  @ApiProperty() adminEmail: string;
  @ApiProperty() targetUserId: string;
  @ApiProperty() targetEmail: string;
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional({ nullable: true }) endedAt: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Seconds' }) durationSec: number | null;
}
```

### [TASK-001] POST /impersonate/:userId
- **Auth:** SUPER_ADMIN. **Request:** `StartImpersonationDto`. **Response 200:** `ImpersonationStateDto`
  + **`Set-Cookie`** re-issuing a scoped access token for the target carrying `impersonatorAdminId`
  (1h). Writes `ImpersonationLog` (start).
- **Errors:** `403 IMPERSONATE_SUPER_ADMIN` (BR-009) · `404 NOT_FOUND` · `403 ACCOUNT_INACTIVE`
  (cannot impersonate a deactivated user).

### [TASK-001] POST /impersonate/exit
- **Auth:** JWT (only valid while impersonating). **Response 200:** `ImpersonationStateDto`
  (`impersonating:false`) + restores the admin session cookies. Closes the `ImpersonationLog` (sets
  `endedAt`/duration). Idempotent if not impersonating (200, no-op).

### [TASK-001] GET /impersonation/history
- **Auth:** SUPER_ADMIN. **Request:** `ImpersonationHistoryQueryDto`. **Response 200:**
  `PaginatedResponseDto<ImpersonationLogDto>` (who/whom/start/end/duration — FR-016).

---

## [TASK-001] Module H — Portal Branding (`/trainer/branding`, `/branding`)

Guards: `/trainer/branding/*` = `RolesGuard(TRAINER)` + `TenantGuard` (own org). `/branding/:trainerId`
= any authenticated user (players read their trainer's branding for theming). Per-trainer branding is
cached in Redis (read-heavy); invalidated on write.

### DTOs

```typescript
export class UpdateBrandingDto {
  @ApiProperty({ example: '#1A73E8', description: 'Primary brand color, 6-digit hex' })
  @Matches(/^#([0-9A-Fa-f]{6})$/, { message: 'Must be a 6-digit hex color, e.g. #1A73E8' })
  primaryColorHex: string;
}

export class BrandingResponseDto {
  @ApiProperty() trainerId: string;
  @ApiPropertyOptional({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ example: '#1A73E8' }) primaryColorHex: string;
  @ApiProperty() updatedAt: string;
}
```

### [TASK-001] GET /trainer/branding
- **Auth:** TRAINER. **Response 200:** `BrandingResponseDto` (own org).

### [TASK-001] PUT /trainer/branding
- **Auth:** TRAINER. **Request:** `UpdateBrandingDto`. **Response 200:** `BrandingResponseDto`.
  **Errors:** `400 VALIDATION_ERROR` (bad hex).

### [TASK-001] POST /trainer/branding/logo
- **Auth:** TRAINER. **Request:** `multipart/form-data`, field `file` (PNG/JPG/**SVG**, ≤ 2 MB,
  ~200×200 — auto-resized via sharp). **Response 200:** `BrandingResponseDto` (with new `logoUrl`).
  **Errors:** `413 FILE_TOO_LARGE` · `415 UNSUPPORTED_FILE_TYPE`.

### [TASK-001] GET /branding/:trainerId
- **Auth:** JWT (any role). **Response 200:** `BrandingResponseDto` — used by player/parent clients to
  theme the portal for the active trainer context. **Errors:** `404 NOT_FOUND`.

---

## [TASK-001] Swagger / OpenAPI Conventions (2026-05-29)

- **Document setup:** `SwaggerModule` at `/api/docs`; `DocumentBuilder` with
  `.addCookieAuth('at')` (not Bearer — cookies carry the token), `.addApiKey({ type:'apiKey',
  in:'header', name:'X-Active-Context' }, 'active-context')`, `.addApiKey({ in:'header',
  name:'X-CSRF-Token' }, 'csrf')`.
- **Per controller:** `@ApiTags('<module>')`, `@ApiCookieAuth('at')`, and `@ApiSecurity('csrf')` on
  mutating routes. Context-scoped controllers add `@ApiSecurity('active-context')`.
- **Every endpoint:** `@ApiOperation({ summary })` + one `@ApiResponse` per documented status. Error
  bodies reference a shared `@ApiResponse({ type: ErrorResponseDto })`.
- **Params/queries:** `@ApiParam`/`@ApiQuery`; UUID params use `ParseUUIDPipe`.
- **Discriminated unions** (`ProfileResponseDto.details`): `@ApiExtraModels(...)` +
  `@ApiProperty({ oneOf: [...] })`.
- **Representative decorated endpoint** (the pattern every endpoint follows — no CQRS):

```typescript
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}   // layered: service, not CommandBus

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Email/password login; sets httpOnly session cookies' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: SessionUserDto, description: 'Logged in (cookies set)' })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'INVALID_CREDENTIALS' })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'EMAIL_NOT_VERIFIED | ACCOUNT_INACTIVE' })
  @ApiResponse({ status: 429, type: ErrorResponseDto, description: 'RATE_LIMITED' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionUserDto> {
    const { user, cookies } = await this.authService.login(dto);
    cookies.forEach((c) => res.cookie(c.name, c.value, c.options));   // at, rt, csrf
    return user;
  }
}
```

```typescript
// Shared error model (Swagger schema for all non-2xx)
export class ErrorResponseDto {
  @ApiProperty({ example: 409 }) statusCode: number;
  @ApiProperty({ example: 'Conflict' }) error: string;
  @ApiProperty({ example: 'EMAIL_EXISTS' }) errorCode: string;
  @ApiProperty({ example: 'An account with this email already exists.' }) message: string;
  @ApiPropertyOptional({ type: [Object], description: 'Field errors for VALIDATION_ERROR only' })
  details?: { field: string; message: string }[];
}
```

---

## [TASK-001] Open Flags & Deferred Contracts (2026-05-29)

| Item | Status / impact on this contract |
|------|----------------------------------|
| **Best Times scoping** (BR-007) | Spec assumes **shared-per-child** (no `trainerId`). If client wants per-coach, `GET/PUT /availability/:subjectType/:subjectId` gain a context requirement and move to Zone-3. **Confirm before building `availability/`.** |
| **Minor-login model** | Whether a child logs in at all gates `MinorAccountGuard` reach (FR-025/026) and whether child sessions see Zone-1. Endpoints assume children *can* log in with constrained permissions; revisit if product disallows child login. |
| **Email template list** (Q-01.04) | Endpoints trigger emails (verification, invite, reset, coach-invite, approval, sharelink-blocked, registration-confirm) via outbox; exact template set is client-owned. |
| **Session TTL** (Q-01.07) | Refresh TTL defaulted to 7d (config flag); does not change the contract. |
| **Skill-level / age-group enums** (Q-01.01/02) | `skillLevel` is read-only in profiles; enum values are placeholders pending client input. Child uses integer `age` (1–18); revisit if DOB/grade is preferred. |
| **Camp→User conversion** (FR-040) | `POST /users/import/camp` is a boundary stub; full flow + payload schema owned by Epic-08. |
| **RSVP cancellation / payment execution** | Emitted via outbox on association-removal / approval; consumed by Epic-02 / Epic-05 respectively (not in this contract). |

---

*Endpoints added by later epics append below with their own `### [TASK-N] METHOD /path` headers.*
