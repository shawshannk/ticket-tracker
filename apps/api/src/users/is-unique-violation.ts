/**
 * postgres-js surfaces Postgres error codes on `.code` (23505 = unique_violation), but
 * Drizzle wraps driver errors in a DrizzleQueryError and hangs the original off `.cause`,
 * so the code has to be looked for down the cause chain, not just on the top-level error.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e != null; e = (e as { cause?: unknown }).cause) {
    if (typeof e !== 'object') return false;
    if ((e as { code?: string }).code === '23505') return true;
  }
  return false;
}
