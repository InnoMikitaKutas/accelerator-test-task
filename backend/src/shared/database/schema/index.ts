export * from './enums';
export * from './users';
export * from './tokens';
export * from './profiles';
export * from './sharelinks';
export * from './associations';
export * from './family';
export * from './availability';
export * from './audit';
export * from './branding';
export * from './outbox';

import { relations } from 'drizzle-orm';
import { users } from './users';
import { trainerProfiles, coachProfiles, playerProfiles } from './profiles';
import { trainerPlayerAssociations } from './associations';

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
  trainer: one(trainerProfiles, {
    fields: [trainerPlayerAssociations.trainerId],
    references: [trainerProfiles.id],
  }),
  player: one(playerProfiles, {
    fields: [trainerPlayerAssociations.playerProfileId],
    references: [playerProfiles.id],
  }),
}));
