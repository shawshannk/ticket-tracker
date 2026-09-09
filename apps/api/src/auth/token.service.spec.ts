import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JWT_AUDIENCE, JWT_ISSUER, MIN_SECRET_BYTES, TokenService } from './token.service';

const SECRET = 'a'.repeat(MIN_SECRET_BYTES);
const claims = { sub: '00000000-0000-4000-8000-000000000001', sid: 'session-1', role: 'admin' as const };

function service(secret = SECRET, ttl = '15m') {
  return new TokenService(secret, ttl);
}

describe('TokenService construction', () => {
  // Failing here means the process never starts. That is the intent: an API that cannot issue
  // tokens should not accept traffic and 500 on the first login instead.
  it('refuses a missing secret', () => {
    expect(() => new TokenService(undefined)).toThrow(/AUTH_JWT_SECRET is not set/);
  });

  it('refuses an empty secret', () => {
    expect(() => new TokenService('')).toThrow(/AUTH_JWT_SECRET is not set/);
  });

  it(`refuses a secret shorter than ${MIN_SECRET_BYTES} bytes`, () => {
    expect(() => new TokenService('a'.repeat(MIN_SECRET_BYTES - 1))).toThrow(/at least 32 bytes/);
  });

  it('measures bytes, not characters', () => {
    // 31 multi-byte characters are well over 32 bytes; a naive length check would reject them.
    expect(() => new TokenService('é'.repeat(31))).not.toThrow();
    expect(() => new TokenService('a'.repeat(MIN_SECRET_BYTES))).not.toThrow();
  });
});

describe('access tokens', () => {
  it('round-trips its claims', () => {
    const svc = service();
    expect(svc.verifyAccessToken(svc.signAccessToken(claims))).toMatchObject(claims);
  });

  it('sets issuer, audience and an expiry', () => {
    const decoded = jwt.decode(service().signAccessToken(claims)) as jwt.JwtPayload;
    expect(decoded.iss).toBe(JWT_ISSUER);
    expect(decoded.aud).toBe(JWT_AUDIENCE);
    expect(decoded.exp! - decoded.iat!).toBe(15 * 60);
  });

  it('rejects a token signed with a different secret', () => {
    const token = service().signAccessToken(claims);
    expect(() => service('b'.repeat(MIN_SECRET_BYTES)).verifyAccessToken(token)).toThrow(UnauthorizedException);
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = service().signAccessToken(claims).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, role: 'admin' })).toString('base64url');
    expect(() => service().verifyAccessToken(`${header}.${forged}.${signature}`)).toThrow(UnauthorizedException);
  });

  it('rejects an unsigned "alg: none" token', () => {
    // The classic JWT bypass. It works whenever the verifier does not pin its algorithms.
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ ...claims, iss: JWT_ISSUER, aud: JWT_AUDIENCE }),
    ).toString('base64url')}.`;
    expect(() => service().verifyAccessToken(none)).toThrow(UnauthorizedException);
  });

  it('rejects a token from another issuer or audience', () => {
    const foreign = jwt.sign({ ...claims }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: 'somewhere-else',
      audience: JWT_AUDIENCE,
    });
    expect(() => service().verifyAccessToken(foreign)).toThrow(UnauthorizedException);
  });

  it('rejects an expired token', () => {
    const expired = service(SECRET, '-1s').signAccessToken(claims);
    expect(() => service().verifyAccessToken(expired)).toThrow(UnauthorizedException);
  });

  it('rejects garbage without leaking why', () => {
    for (const bad of ['', 'not.a.token', 'a.b.c']) {
      expect(() => service().verifyAccessToken(bad)).toThrow('Invalid or expired access token');
    }
  });
});

describe('refresh tokens', () => {
  it('generates a high-entropy opaque token with its digest', () => {
    const { token, tokenHash } = service().generateRefreshToken();
    // 32 random bytes, base64url — not a JWT, nothing but the database reads it.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });

  it('never repeats', () => {
    const svc = service();
    const seen = new Set(Array.from({ length: 500 }, () => svc.generateRefreshToken().token));
    expect(seen.size).toBe(500);
  });

  it('hashes deterministically, so the digest can carry a unique index', () => {
    const svc = service();
    const { token, tokenHash } = svc.generateRefreshToken();
    expect(svc.hashRefreshToken(token)).toBe(tokenHash);
    // Independent of the secret: the digest is a lookup key, not a signature.
    expect(service('z'.repeat(MIN_SECRET_BYTES)).hashRefreshToken(token)).toBe(tokenHash);
  });
});
