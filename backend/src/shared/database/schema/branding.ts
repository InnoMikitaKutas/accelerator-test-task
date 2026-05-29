import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { trainerProfiles } from './profiles';

export const trainerBranding = pgTable('trainer_branding', {
  trainerId: uuid('trainer_id')
    .primaryKey()
    .references(() => trainerProfiles.id), // TENANT KEY
  logoUrl: varchar('logo_url', { length: 1024 }),
  primaryColorHex: varchar('primary_color_hex', { length: 7 }).notNull().default('#1A73E8'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
