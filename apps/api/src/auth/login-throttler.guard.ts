import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limiting keyed on **ip + email**, not IP alone (spec 10 §4.2).
 *
 * IP alone punishes everyone behind one NAT for one person's typo; email alone lets an attacker
 * spray a whole user list from a single host without ever tripping it. Keying on the pair means
 * a credential-stuffing run is slowed per target *and* per source.
 *
 * Single-process counters (docs/auth-tech-spec.md §6.6): a multi-instance deployment needs a
 * shared store before this is worth much.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return email ? `${ip}:${email}` : String(ip);
  }
}
