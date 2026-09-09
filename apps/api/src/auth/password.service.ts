import { BadRequestException, Injectable } from '@nestjs/common';
import { checkPassword, PASSWORD_ISSUE_MESSAGES, type PasswordContext } from '@ticket-tracker/shared';
import * as argon2 from 'argon2';

/**
 * argon2id at the OWASP baseline (docs/auth-tech-spec.md §6.9). Exported because the seed
 * hashes the development password with the same parameters — M15 held these inline in
 * `seed.ts` until this service existed.
 */
// No explicit type annotation: argon2 v0.45 does not export an `Options` type, and annotating
// with one selects the `raw: true` overload, whose `hash()` returns a Buffer rather than the
// encoded string we store.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A hash of a value nobody knows, verified when the email is unrecognised so that login takes
 * the same time either way (docs/auth-tech-spec.md §6.5). Computed once, lazily: it costs the
 * same 19 MiB as a real hash and there is no reason to pay that at import time.
 */
let dummyHash: string | undefined;

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /**
   * Never throws on a malformed or foreign hash — a corrupt stored value must read as "wrong
   * password", not as a 500 that tells the caller something unusual about this account.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Burn the same work as a real verification, for an email that has no account or no password.
   * Always returns false; the return type exists so call sites read symmetrically.
   */
  async verifyDummy(password: string): Promise<boolean> {
    dummyHash ??= await argon2.hash('an-unguessable-value-for-timing-equalisation', ARGON2_OPTIONS);
    const hash = dummyHash;
    await this.verify(hash, password);
    return false;
  }

  /** Every failure at once, not just the first — see `checkPassword` in shared. */
  check(password: string, context: PasswordContext = {}): string[] {
    return checkPassword(password, context).map((issue) => PASSWORD_ISSUE_MESSAGES[issue]);
  }

  /** Throws 400 with the full issue list, matching the shape ZodValidationPipe produces. */
  assertAcceptable(password: string, context: PasswordContext = {}): void {
    const messages = this.check(password, context);
    if (messages.length > 0) {
      throw new BadRequestException({
        message: 'Password does not meet the requirements',
        issues: messages.map((message) => ({ path: 'password', message })),
      });
    }
  }
}
