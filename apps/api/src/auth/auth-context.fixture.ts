import type { User, UserRole } from '@ticket-tracker/shared';
import type { AuthContext } from './auth-context';

/**
 * Build an `AuthContext` by hand, for handler-level tests that call a command directly and so
 * never run the guards that would normally populate it.
 *
 * Test-only, and named to say so. It defaults `projectRole` to the user's global role, which is
 * what M3-era specs assumed when they passed a bare `User`; a test exercising R13 should pass
 * the two separately and disagree on purpose.
 */
export function authContextFor(user: User, projectRole: UserRole | null = user.role): AuthContext {
  return {
    user,
    sessionId: null,
    impersonated: false,
    projectRole: projectRole ?? undefined,
  };
}
