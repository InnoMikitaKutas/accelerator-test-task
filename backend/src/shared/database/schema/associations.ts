import { sql } from 'drizzle-orm';
import { pgTable, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { associationStatusEnum } from './enums';
import { trainerProfiles, coachProfiles, playerProfiles } from './profiles';
import { shareLinks } from './sharelinks';

export const trainerPlayerAssociations = pgTable(
  'trainer_player_associations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => trainerProfiles.id), // TENANT KEY (P-1)
    playerProfileId: uuid('player_profile_id')
      .notNull()
      .references(() => playerProfiles.id),
    viaShareLinkId: uuid('via_sharelink_id').references(() => shareLinks.id),
    status: associationStatusEnum('status').notNull().default('active'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('tpa_trainer_idx').on(t.trainerId),
    index('tpa_player_idx').on(t.playerProfileId),
    // One active link per (trainer, player) — BR-004 dedupe.
    uniqueIndex('tpa_active_unique')
      .on(t.trainerId, t.playerProfileId)
      .where(sql`status = 'active'`),
  ],
);

export const trainerCoachAssociations = pgTable(
  'trainer_coach_associations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => trainerProfiles.id), // TENANT KEY
    coachProfileId: uuid('coach_profile_id')
      .notNull()
      .references(() => coachProfiles.id),
    status: associationStatusEnum('status').notNull().default('active'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('tca_trainer_idx').on(t.trainerId),
    // BR-003/FR-029: exactly ONE active trainer per coach — DB-enforced.
    uniqueIndex('tca_one_active_trainer_per_coach')
      .on(t.coachProfileId)
      .where(sql`status = 'active'`),
  ],
);
