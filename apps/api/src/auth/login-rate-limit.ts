/**
 * The login / invite-accept rate limit (spec 10 §4.2): 10 attempts per 15 minutes per ip+email.
 *
 * Configurable only so a **development** stack can raise it. The e2e suite signs in for real on
 * behalf of several people, several times per run, from one host — two runs inside the window
 * exhaust a limit tuned for humans, and the failure looks like a broken login page rather than a
 * limiter doing its job. The spec's numbers remain the defaults, so anything that does not set
 * these variables gets exactly the specified behaviour.
 */
function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const LOGIN_RATE_LIMIT = {
  limit: positiveInt(process.env.AUTH_LOGIN_RATE_LIMIT, 10),
  ttl: positiveInt(process.env.AUTH_LOGIN_RATE_TTL_MS, 15 * 60 * 1000),
} as const;
