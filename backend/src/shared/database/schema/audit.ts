import { pgTable, uuid, varchar, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id'),
  impersonatorAdminId: uuid('impersonator_admin_id'), // set when performed under impersonation
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
    adminId: uuid('admin_id')
      .notNull()
      .references(() => users.id),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id),
    reason: varchar('reason', { length: 500 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSec: integer('duration_sec'),
  },
  (t) => [
    index('imp_admin_idx').on(t.adminId),
    index('imp_target_idx').on(t.targetUserId),
    index('imp_started_idx').on(t.startedAt),
  ],
);

export const userDeletionLogs = pgTable('user_deletion_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalUserId: uuid('original_user_id').notNull(),
  originalEmail: varchar('original_email', { length: 255 }).notNull(),
  deletedBy: uuid('deleted_by')
    .notNull()
    .references(() => users.id),
  reason: varchar('reason', { length: 500 }).notNull(),
  backupRef: varchar('backup_ref', { length: 255 }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
});
