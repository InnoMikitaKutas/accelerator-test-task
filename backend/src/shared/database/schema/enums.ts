import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['SUPER_ADMIN', 'TRAINER', 'COACH', 'PLAYER']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'INACTIVE', 'DELETED']);
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']);
// Q-01.01 placeholder — client to supply real skill-level values.
export const skillLevelEnum = pgEnum('skill_level', ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
export const shareLinkTypeEnum = pgEnum('sharelink_type', ['static', 'unique']);
export const shareLinkStatusEnum = pgEnum('sharelink_status', [
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
  'ACTIVE',
]);
export const associationStatusEnum = pgEnum('association_status', ['active', 'inactive']);
export const paymentTypeEnum = pgEnum('payment_type', ['USD', 'TOKEN']);
export const approvalStatusEnum = pgEnum('approval_status', [
  'PENDING',
  'APPROVED',
  'DENIED',
  'EXPIRED',
]);
export const subjectTypeEnum = pgEnum('subject_type', ['player', 'coach']);
export const outboxStatusEnum = pgEnum('outbox_status', ['PENDING', 'SENT', 'FAILED', 'DEAD']);

// Convenience union types derived from the DB enums (used across guards, DTOs, claims).
export type Role = (typeof roleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type Gender = (typeof genderEnum.enumValues)[number];
export type SkillLevel = (typeof skillLevelEnum.enumValues)[number];
export type ShareLinkType = (typeof shareLinkTypeEnum.enumValues)[number];
export type ShareLinkStatus = (typeof shareLinkStatusEnum.enumValues)[number];
export type AssociationStatus = (typeof associationStatusEnum.enumValues)[number];
export type PaymentType = (typeof paymentTypeEnum.enumValues)[number];
export type ApprovalStatus = (typeof approvalStatusEnum.enumValues)[number];
export type SubjectType = (typeof subjectTypeEnum.enumValues)[number];
