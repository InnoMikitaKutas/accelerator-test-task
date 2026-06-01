import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id }); // NFR-006
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain).catch(() => false);
  }

  /**
   * Temp password for admin-created trainers (FR-005). Guarantees the API password policy:
   * ≥8 chars, ≥1 letter, ≥1 digit.
   */
  generateTemp(length = 12): string {
    const chars: string[] = [
      LETTERS[randomInt(LETTERS.length)],
      DIGITS[randomInt(DIGITS.length)],
    ];
    while (chars.length < length) chars.push(ALPHABET[randomInt(ALPHABET.length)]);
    // Fisher–Yates shuffle so the guaranteed letter/digit aren't always first.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}
