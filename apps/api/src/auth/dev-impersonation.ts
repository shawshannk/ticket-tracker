/**
 * The legacy `X-Acting-User-Id` header (spec 08) survives only as a development affordance.
 *
 * Read **once, at module load**, never per request: a value re-read from `process.env` on every
 * call is a value that can be changed while the process runs, and this one decides whether
 * authentication can be skipped.
 */
export const ACTING_USER_HEADER = 'x-acting-user-id';

export const DEV_IMPERSONATION_ENABLED = process.env.AUTH_DEV_IMPERSONATION === 'true';

/**
 * Called from `main.ts` before the app is created. Throwing here means the process never
 * listens — far better than starting in a state where anyone can claim any identity.
 */
export function assertImpersonationIsSafe(
  enabled: boolean = DEV_IMPERSONATION_ENABLED,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (enabled && nodeEnv === 'production') {
    throw new Error(
      'AUTH_DEV_IMPERSONATION=true is refused when NODE_ENV=production: it lets any caller act ' +
        'as any user. Unset it, or do not run this build in production.',
    );
  }
}
