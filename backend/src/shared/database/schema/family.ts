import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { paymentTypeEnum, approvalStatusEnum } from './enums';
import { playerProfiles, trainerProfiles } from './profiles';
import { users } from './users';

export const childPurchaseApprovals = pgTable(
  'child_purchase_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    childProfileId: uuid('child_profile_id')
      .notNull()
      .references(() => playerProfiles.id),
    parentUserId: uuid('parent_user_id')
      .notNull()
      .references(() => users.id),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => trainerProfiles.id), // TENANT KEY
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
  childProfileId: uuid('child_profile_id')
    .primaryKey()
    .references(() => playerProfiles.id),
  allowTokenWithoutApproval: boolean('allow_token_without_approval').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
