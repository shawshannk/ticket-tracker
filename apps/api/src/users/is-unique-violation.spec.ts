import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './is-unique-violation';

describe('isUniqueViolation', () => {
  it('matches a bare driver error', () => {
    expect(isUniqueViolation(Object.assign(new Error('dup'), { code: '23505' }))).toBe(true);
  });

  it('matches a driver error wrapped by DrizzleQueryError', () => {
    const cause = Object.assign(new Error('dup'), { code: '23505' });
    expect(isUniqueViolation(Object.assign(new Error('Failed query'), { cause }))).toBe(true);
  });

  it('ignores other Postgres error codes', () => {
    const cause = Object.assign(new Error('fk'), { code: '23503' });
    expect(isUniqueViolation(Object.assign(new Error('Failed query'), { cause }))).toBe(false);
  });

  it('ignores errors with no code and terminates on a null cause', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
