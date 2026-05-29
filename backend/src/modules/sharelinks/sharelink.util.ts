import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** High-entropy shareable code (relies on the unique index; collisions retried on insert). */
export function generateShareCode(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export interface JoinStatusInput {
  active: boolean;
  status: string;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
}

/** Pure resolution of a link's public join status (api-spec GET /join/:code). */
export function computeJoinStatus(
  link: JoinStatusInput,
  now: Date,
): 'VALID' | 'EXPIRED' | 'USED' | 'INVALID' {
  if (!link.active || link.status === 'REVOKED') return 'INVALID';
  if (link.expiresAt && link.expiresAt.getTime() < now.getTime()) return 'EXPIRED';
  if (link.maxUses !== null && link.useCount >= link.maxUses) return 'USED';
  return 'VALID';
}
