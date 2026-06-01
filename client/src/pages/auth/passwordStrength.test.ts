import { scorePassword } from './passwordStrength';

describe('scorePassword', () => {
  it('treats an empty value as unscored and failing the gate', () => {
    expect(scorePassword('')).toEqual({
      score: 0,
      label: '',
      tone: 'foul',
      meetsRequirements: false,
    });
  });

  it('fails the gate without ≥8 chars, a letter, and a number', () => {
    expect(scorePassword('abcdef').meetsRequirements).toBe(false); // no number, < 8
    expect(scorePassword('abcdefgh').meetsRequirements).toBe(false); // no number
    expect(scorePassword('12345678').meetsRequirements).toBe(false); // no letter
    expect(scorePassword('abc12').meetsRequirements).toBe(false); // < 8
  });

  it('passes the gate at exactly 8 chars with a letter + number', () => {
    const s = scorePassword('abcdefg1');
    expect(s.meetsRequirements).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(2);
  });

  it('caps a gate-failing value at "Weak" no matter how long', () => {
    // 20 letters, no number → never meets the gate.
    const s = scorePassword('abcdefghijklmnopqrst');
    expect(s.meetsRequirements).toBe(false);
    expect(s.score).toBeLessThanOrEqual(1);
  });

  it('rates a long mixed-case password with symbols as Strong', () => {
    const s = scorePassword('Abcd1234!wxyz');
    expect(s.meetsRequirements).toBe(true);
    expect(s.score).toBe(4);
    expect(s.label).toBe('Strong');
    expect(s.tone).toBe('go');
  });
});
