import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { shareLinkTypeEnum, shareLinkStatusEnum } from './enums';
import { trainerProfiles } from './profiles';
import { users } from './users';

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 32 }).notNull(),
    type: shareLinkTypeEnum('type').notNull(),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => trainerProfiles.id), // TENANT KEY
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    targetEmail: varchar('target_email', { length: 255 }), // coach invites only
    label: varchar('label', { length: 120 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // null = no expiry (static)
    maxUses: integer('max_uses'), // null = unlimited (static); 1 = unique
    useCount: integer('use_count').notNull().default(0),
    status: shareLinkStatusEnum('status').notNull().default('ACTIVE'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('share_links_code_unique').on(t.code),
    index('share_links_trainer_idx').on(t.trainerId),
    // Backs keyset pagination on (created_at, id) — mirrors users_created_id_idx (L1/NFR-002).
    index('share_links_created_id_idx').on(t.createdAt, t.id),
  ],
);
