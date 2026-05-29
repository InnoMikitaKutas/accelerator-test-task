import { createHash, randomBytes } from 'crypto';

/** Opaque token for email links — raw value emailed, hash stored (architecture §Tokens). */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url'); // ~43 chars (within the 20–256 DTO bound)
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
