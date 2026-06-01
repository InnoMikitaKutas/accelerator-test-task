import { pgTable, uuid, integer, boolean, time, timestamp, varchar, index } from 'drizzle-orm/pg-core';
import { subjectTypeEnum } from './enums';
import { coachProfiles, trainerProfiles } from './profiles';
import { users } from './users';

// P-4: Best Times = one shared schedule per subject → NO trainerId here (Zone-2, no RLS).
// Flagged: if client wants per-coach, add trainerId and move to Zone-3.
export const availability = pgTable(
  'availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: subjectTypeEnum('subject_type').notNull(), // 'player' | 'coach'
    subjectId: uuid('subject_id').notNull(), // player_profiles.id OR coach_profiles.id (polymorphic, no FK)
    dayOfWeek: integer('day_of_week').notNull(), // 0=Sun..6=Sat
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
  eventId: uuid('event_id').notNull(), // Epic-02 owns event linkage
  coachId: uuid('coach_id')
    .notNull()
    .references(() => coachProfiles.id),
  trainerId: uuid('trainer_id')
    .notNull()
    .references(() => trainerProfiles.id), // TENANT KEY
  overriddenBy: uuid('overridden_by')
    .notNull()
    .references(() => users.id),
  reason: varchar('reason', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
