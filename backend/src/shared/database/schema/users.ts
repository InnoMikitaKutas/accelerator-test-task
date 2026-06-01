import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
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
    // Minor login (P-5): a constrained child User. Provisioning is implemented by
    // FamilyRepository.enableChildLogin (FR-026); creation is gated behind the parent flow.
    isMinor: boolean('is_minor').notNull().default(false),
    managedByParentUserId: uuid('managed_by_parent_user_id').references(
      (): AnyPgColumn => users.id,
    ),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    photoUrl: varchar('photo_url', { length: 1024 }),
    thumbnailUrl: varchar('thumbnail_url', { length: 1024 }),
    // Context-switch default seed (FR-019). No FK to avoid a circular schema import; integrity
    // is enforced at the service layer when persisting a default context.
    defaultSubjectProfileId: uuid('default_subject_profile_id'),
    defaultTrainerId: uuid('default_trainer_id'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // FR-002: email unique. GDPR anonymization rewrites email to a unique per-user value,
    // so deleted rows never collide. Emails are lower-cased at the service boundary.
    uniqueIndex('users_email_unique').on(t.email),
    index('users_role_status_idx').on(t.role, t.status),
    index('users_parent_idx').on(t.managedByParentUserId),
    // Keyset pagination support (NFR-002, architect review R9).
    index('users_created_id_idx').on(t.createdAt, t.id),
  ],
);
