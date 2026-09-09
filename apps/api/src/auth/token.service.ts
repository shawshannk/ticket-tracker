import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@ticket-tracker/shared';

export const JWT_ISSUER = 'ticket-tracker';
export const JWT_AUDIENCE = 'ticket-tracker-api';

/** Below this, an HS256 secret is weaker than the digest it keys (docs/auth-tech-spec.md §3.1). */
export const MIN_SECRET_BYTES = 32;

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id — the refresh token's family, so a session can be traced from an access token. */
  sid: string;
  /**
   * The user's **global** role. Present for cheap platform-level checks only; AuthGuard re-reads
   * it from the database on every request, and the database wins on disagreement. Never put
   * memberships here — they change while a session is live (docs/auth-tech-spec.md §3.1).
   */
  role: UserRole;
}

@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly accessTtl: string;

  /**
   * The secret is validated **at construction**, not at first use: a process that cannot issue
   * tokens should fail to boot, loudly, rather than start and 500 on the first login.
   */
  constructor(
    secret: string | undefined = process.env.AUTH_JWT_SECRET,
    accessTtl: string = process.env.AUTH_ACCESS_TTL ?? '15m',
  ) {
    if (!secret) {
      throw new Error('AUTH_JWT_SECRET is not set — the API cannot issue access tokens.');
    }
    if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
      throw new Error(
        `AUTH_JWT_SECRET must be at least ${MIN_SECRET_BYTES} bytes (got ${Buffer.byteLength(secret, 'utf8')}).`,
      );
    }
    this.secret = secret;
    this.accessTtl = accessTtl;
  }

  signAccessToken(claims: AccessTokenClaims): string {
    return jwt.sign(claims, this.secret, {
      algorithm: 'HS256',
      expiresIn: this.accessTtl,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    } as jwt.SignOptions);
  }

  /**
   * `algorithms` is pinned explicitly. Without it a token claiming `alg: none` — or HS256 over a
   * key the verifier was not expecting — is the classic JWT bypass.
   */
  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (typeof payload === 'string') {
        throw new Error('unexpected string payload');
      }
      return { sub: String(payload.sub), sid: String(payload.sid), role: payload.role as UserRole };
    } catch {
      // Uniform: expiry, tampering and a wrong-issuer token are all just "not usable".
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /**
   * Opaque refresh token: 32 random bytes, and only its sha256 is ever stored. A plain digest is
   * correct here — the value already carries full entropy, the lookup runs on every refresh, and
   * a unique index needs a deterministic hash, which a salted KDF is not.
   */
  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
