import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { genderEnum, skillLevelEnum } from './enums';
import { users } from './users';

export const trainerProfiles = pgTable('trainer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  businessName: varchar('business_name', { length: 200 }).notNull(),
  businessAddress: varchar('business_address', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const coachProfiles = pgTable('coach_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  bio: text('bio'),
  credentials: text('credentials').array().notNull().default([]),
  certifications: text('certifications').array().notNull().default([]),
  publicVisible: boolean('public_visible').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// A parent User owns N player profiles (self + children) → userId is NOT unique here.
export const playerProfiles = pgTable(
  'player_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id), // owning account (parent or self)
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    isSelf: boolean('is_self').notNull().default(false), // account holder's own player profile (FR-020)
    isChild: boolean('is_child').notNull().default(false), // BR-006: all under-18 parent-managed
    parentUserId: uuid('parent_user_id').references(() => users.id), // = userId for children; null for self
    age: integer('age'), // 1..18 enforced in DTO/service for children
    gender: genderEnum('gender').notNull().default('UNSPECIFIED'),
    school: varchar('school', { length: 200 }),
    skillLevel: skillLevelEnum('skill_level'), // read-only via API (FR-038)
    emergencyContactName: varchar('emergency_contact_name', { length: 120 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 32 }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete (BR-010)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('player_profiles_user_idx').on(t.userId),
    index('player_profiles_parent_idx').on(t.parentUserId),
  ],
);
