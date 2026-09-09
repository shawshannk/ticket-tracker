import { BadRequestException } from '@nestjs/common';
import { checkPassword, isPasswordAcceptable, PASSWORD_MIN_LENGTH } from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

const service = new PasswordService();

// Spec 10 §5.1 states the policy in prose; this table restates it independently of the
// implementation, so a loosened rule fails a test rather than silently redefining the policy.
describe('password policy', () => {
  it(`requires at least ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(checkPassword('short')).toContain('too_short');
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toContain('too_short');
    expect(checkPassword('correct horse battery')).not.toContain('too_short');
  });

  it('rejects commonly breached passwords', () => {
    expect(checkPassword('passwordpassword')).toContain('too_common');
    expect(checkPassword('PasswordPassword')).toContain('too_common'); // case-insensitive
    expect(checkPassword('qwertyuiop123')).toContain('too_common');
  });

  it('rejects a password built from the email local part or the name', () => {
    const ctx = { email: 'marcus.chen@nimbus.io', name: 'Marcus Chen' };
    expect(checkPassword('marcus.chen-2026!', ctx)).toContain('contains_identifier');
    expect(checkPassword('xxMARCUS CHENxx99', ctx)).toContain('contains_identifier');
    expect(checkPassword('unrelated-phrase-42', ctx)).not.toContain('contains_identifier');
  });

  it('ignores identifiers too short to be meaningful', () => {
    // A two-letter name would match almost any password; the check would be noise.
    expect(checkPassword('a-perfectly-fine-password', { name: 'Bo' })).toEqual([]);
  });

  it('reports every failure at once, not just the first', () => {
    // The invite page renders the whole checklist, so a single-issue response is not enough.
    expect(checkPassword('password', { email: 'password@x.io' }).sort()).toEqual(
      ['contains_identifier', 'too_short'].sort(),
    );
    // too_common + contains_identifier, without too_short. Note that all three cannot fire at
    // once by construction: COMMON_PASSWORDS holds nothing shorter than the minimum length,
    // since anything shorter is already rejected on length.
    expect(checkPassword('passwordpassword', { email: 'passwordpassword@x.io' }).sort()).toEqual(
      ['contains_identifier', 'too_common'].sort(),
    );
  });

  it('accepts a reasonable password', () => {
    expect(isPasswordAcceptable('correct-horse-battery-staple', { email: 'a@b.io' })).toBe(true);
  });

  it('accepts the seeded development password', () => {
    // If this ever fails, `pnpm run db:seed` produces accounts that cannot be used.
    for (const email of ['jordan.lee@nimbus.io', 'diego.ramirez@nimbus.io']) {
      expect(isPasswordAcceptable('DevPassw0rd!2026', { email })).toBe(true);
    }
  });
});

describe('PasswordService.assertAcceptable', () => {
  it('throws 400 listing every issue', () => {
    try {
      service.assertAcceptable('password', { email: 'password@x.io' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as {
        issues: { path: string; message: string }[];
      };
      expect(body.issues).toHaveLength(2);
      expect(body.issues.every((i) => i.path === 'password')).toBe(true);
    }
  });

  it('is silent for an acceptable password', () => {
    expect(() => service.assertAcceptable('correct-horse-battery-staple')).not.toThrow();
  });
});

describe('PasswordService hashing', () => {
  it('produces an argon2id hash that verifies', async () => {
    const hash = await service.hash('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify(hash, 'correct-horse-battery-staple')).toBe(true);
    expect(await service.verify(hash, 'wrong-password-entirely')).toBe(false);
  });

  it('salts: the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([service.hash('same-password-here'), service.hash('same-password-here')]);
    expect(a).not.toBe(b);
  });

  it('reads a malformed stored hash as a wrong password, not an error', async () => {
    // A corrupt value must not surface as a 500 — that would tell a caller this account is odd.
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
    await expect(service.verify('', 'anything')).resolves.toBe(false);
  });

  it('verifyDummy always fails but does the work', async () => {
    await expect(service.verifyDummy('anything')).resolves.toBe(false);
  });
}, 30_000);
