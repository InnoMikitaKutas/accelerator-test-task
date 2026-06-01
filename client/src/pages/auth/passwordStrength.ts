import type { Tone } from '@/services/errorMap';

/**
 * Client-side password strength signal for the reset / forced-change meters. The
 * hard gate (`meetsRequirements`) mirrors the server rule exactly: ≥8 chars, ≥1
 * letter and ≥1 number (api-spec ResetPasswordDto/ChangePasswordDto). The 0–4
 * `score` is advisory UI only.
 */
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tone: Tone;
  /** True only when the value would pass server validation. */
  meetsRequirements: boolean;
}

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

function toneFor(score: number): Tone {
  if (score >= 3) return 'go';
  if (score === 2) return 'pending';
  return 'foul';
}

export function scorePassword(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '', tone: 'foul', meetsRequirements: false };

  const hasLetter = /[A-Za-z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const hasMixedCase = /[a-z]/.test(pw) && /[A-Z]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const meetsRequirements = pw.length >= 8 && hasLetter && hasNumber;

  let raw = 0;
  if (pw.length >= 8) raw += 1;
  if (pw.length >= 12) raw += 1;
  if (hasMixedCase) raw += 1;
  if (hasNumber) raw += 1;
  if (hasSymbol) raw += 1;

  // A value that doesn't meet the gate can never read above "Weak".
  const score = (meetsRequirements ? Math.min(4, raw) : Math.min(1, raw)) as PasswordStrength['score'];
  return { score, label: LABELS[score], tone: toneFor(score), meetsRequirements };
}
