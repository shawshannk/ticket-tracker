import { afterEach, describe, expect, it } from 'vitest';
import { refreshCookieOptions } from './cookies';

const original = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = original;
});

describe('refresh cookie', () => {
  it('is httpOnly, Lax, and scoped to /auth', () => {
    const opts = refreshCookieOptions();
    // httpOnly is what stops XSS reading the long-lived credential (spec 10 §8).
    expect(opts.httpOnly).toBe(true);
    // Lax + POST is what closes CSRF on the refresh route without a CSRF token.
    expect(opts.sameSite).toBe('lax');
    // Path scoping keeps the token off every ordinary API request.
    expect(opts.path).toBe('/auth');
  });

  it('is Secure in production and not in development', () => {
    process.env.NODE_ENV = 'production';
    expect(refreshCookieOptions().secure).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(refreshCookieOptions().secure).toBe(false);
  });

  it('carries an expiry when given one', () => {
    const expires = new Date('2027-01-01T00:00:00Z');
    expect(refreshCookieOptions(expires).expires).toEqual(expires);
    expect(refreshCookieOptions().expires).toBeUndefined();
  });
});
