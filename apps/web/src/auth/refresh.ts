import type { AuthResult } from '@ticket-tracker/shared';
import { apiFetch } from '../api/client';
import { isSessionDead, setAccessToken, setRefreshHandler } from './tokenStore';

/**
 * One refresh at a time, shared by every caller (docs/auth-tech-spec.md §7).
 *
 * **Why this matters more than it looks.** When a token expires, every query in flight 401s at
 * once. Ten independent refreshes would each present the same cookie, and M16's rotation
 * consumes a refresh token on use — so the second through tenth would be presenting an
 * already-consumed token, which is precisely the signal reuse detection reads as a stolen token
 * (R16). The whole session family would be revoked and the user thrown out, on nothing worse
 * than a page with ten widgets. The shared promise is what stops that.
 */
let inFlight: Promise<AuthResult | null> | null = null;

/**
 * Never rejects. A failed refresh is an ordinary outcome — the cookie is gone, expired, or was
 * revoked — and callers branch on `null` rather than on a thrown error, which also keeps the
 * shared promise from producing an unhandled rejection for every caller that didn't await it
 * first.
 */
async function performRefresh(): Promise<AuthResult | null> {
  try {
    const result = await apiFetch<AuthResult>('/auth/refresh', { method: 'POST', skipAuthRefresh: true });
    setAccessToken(result.accessToken);
    return result;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export function refreshSession(): Promise<AuthResult | null> {
  // Once a refresh has failed, the cookie is gone or revoked and every later attempt would fail
  // the same way. Short-circuiting keeps a page full of queries from firing one doomed refresh
  // each on its way to the login redirect.
  if (isSessionDead()) return Promise.resolve(null);

  // `finally` clears the slot *after* every current waiter has resolved, so a burst of 401s
  // shares one request while a later, genuinely separate expiry still gets its own.
  inFlight ??= performRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// Registered at module scope so `apiFetch` can reach it without importing this file — see the
// note on `setRefreshHandler`. AuthProvider imports `refreshSession` directly, which is what
// evaluates this module during app startup, before any request can 401.
setRefreshHandler(refreshSession);

/** Test seam: the module-level promise otherwise leaks between test cases. */
export function resetRefreshForTests(): void {
  inFlight = null;
}
