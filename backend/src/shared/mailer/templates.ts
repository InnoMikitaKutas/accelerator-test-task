/**
 * Inferred required template set (requirements Gap Q-01.04 — confirm exact list with client).
 * Each render() is plain-text for dev; swap for HTML templates in prod.
 */
export type MailTemplateId =
  | 'email.verification'
  | 'password.reset'
  | 'trainer.invite'
  | 'coach.invite'
  | 'child.approval-request'
  | 'child.approval-expired'
  | 'sharelink.blocked-parent'
  | 'registration.confirm';

interface Template {
  subject: string;
  render: (v: Record<string, string>) => string;
}

export const TEMPLATES: Record<MailTemplateId, Template> = {
  'email.verification': {
    subject: 'Verify your email',
    render: (v) => `Welcome${v.name ? ` ${v.name}` : ''}! Verify your email: ${v.link}`,
  },
  'password.reset': {
    subject: 'Reset your password',
    render: (v) => `Reset your password (valid 1 hour): ${v.link}`,
  },
  'trainer.invite': {
    subject: 'You have been invited as a Trainer',
    render: (v) =>
      v.tempPassword
        ? `An account was created for you. Temporary password: ${v.tempPassword}. Sign in at ${v.link} and change it.`
        : `You have been invited. Set up your account: ${v.link}`,
  },
  'coach.invite': {
    subject: 'Coach invitation',
    render: (v) => `${v.trainerName ?? 'A trainer'} invited you to join as a coach: ${v.link}`,
  },
  'child.approval-request': {
    subject: 'Approval needed',
    render: (v) =>
      `${v.childName} requested a purchase (${v.item}). Review within 48h: ${v.link}`,
  },
  'child.approval-expired': {
    subject: 'A purchase request expired',
    render: (v) =>
      `A purchase request (${v.item}) expired without a decision and was auto-denied. View your requests: ${v.link}`,
  },
  'sharelink.blocked-parent': {
    subject: 'Action needed for your child',
    render: (v) =>
      `Your child tried to join a new trainer. Register the association from your account: ${v.link}`,
  },
  'registration.confirm': {
    subject: 'Welcome',
    render: (v) => `Your account is ready${v.trainerName ? ` with ${v.trainerName}` : ''}.`,
  },
};
