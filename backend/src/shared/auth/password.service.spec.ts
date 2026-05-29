import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes and verifies a password', async () => {
    const hash = await svc.hash('P@ssw0rd!');
    expect(hash).not.toContain('P@ssw0rd!');
    expect(await svc.verify(hash, 'P@ssw0rd!')).toBe(true);
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });

  it('verify returns false on a malformed hash instead of throwing', async () => {
    expect(await svc.verify('not-a-hash', 'x')).toBe(false);
  });

  it('generateTemp satisfies the password policy (≥8, ≥1 letter, ≥1 digit)', () => {
    for (let i = 0; i < 50; i++) {
      const t = svc.generateTemp();
      expect(t.length).toBeGreaterThanOrEqual(8);
      expect(/[A-Za-z]/.test(t)).toBe(true);
      expect(/\d/.test(t)).toBe(true);
    }
  });
});
