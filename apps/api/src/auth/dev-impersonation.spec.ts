import { describe, expect, it } from 'vitest';
import { assertImpersonationIsSafe } from './dev-impersonation';

/**
 * The single control that keeps spec 08's "anyone can claim to be anyone" out of production.
 * It runs at boot, before anything listens, so a misconfigured deploy fails to start rather
 * than serving traffic with authentication effectively switched off.
 */
describe('assertImpersonationIsSafe', () => {
  it('refuses impersonation in production', () => {
    expect(() => assertImpersonationIsSafe(true, 'production')).toThrow(/refused when NODE_ENV=production/);
  });

  it('allows it outside production', () => {
    for (const env of ['development', 'test', undefined]) {
      expect(() => assertImpersonationIsSafe(true, env)).not.toThrow();
    }
  });

  it('allows production when impersonation is off', () => {
    expect(() => assertImpersonationIsSafe(false, 'production')).not.toThrow();
  });
});
