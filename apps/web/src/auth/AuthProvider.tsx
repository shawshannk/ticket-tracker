import type { AuthResult, Membership, User } from '@ticket-tracker/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { refreshSession } from './refresh';
import { setAccessToken, setSessionExpiredHandler } from './tokenStore';

/**
 * Who is signed in, for the whole app (docs/auth-tech-spec.md §7).
 *
 * `status` has three values, and the distinction between the first two is the whole reason a
 * reload doesn't flash the login page: until bootstrap's single refresh resolves we are
 * `loading`, not `anonymous`, and `RequireAuth` renders a splash rather than redirecting.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  memberships: Membership[];
  /** Set when a session ends mid-use, so the login page can explain why (spec 10 §6). */
  expired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (allSessions?: boolean) => Promise<void>;
  /** After accepting an invite, which signs the person in as a side effect. */
  adopt: (result: AuthResult) => void;
  clearExpired: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** v1 persisted the selected acting user here. Left behind, it is just a stale id in storage. */
const LEGACY_ACTING_USER_KEY = 'ticket-tracker.acting-user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [expired, setExpired] = useState(false);
  const queryClient = useQueryClient();

  const adopt = useCallback((result: AuthResult) => {
    setAccessToken(result.accessToken);
    setUser(result.user);
    setMemberships(result.memberships);
    setExpired(false);
    setStatus('authenticated');
  }, []);

  const forget = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setMemberships([]);
    setStatus('anonymous');
    // Cached rows belong to the person who just left. Without this, the next sign-in on the same
    // tab paints the previous account's tickets for a frame before refetching.
    queryClient.clear();
  }, [queryClient]);

  // A ref, not the callback itself: `notifySessionExpired` fires from `apiFetch`, and
  // re-registering on every render would make this effect churn.
  const forgetRef = useRef(forget);
  forgetRef.current = forget;

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setExpired(true);
      forgetRef.current();
    });
    return () => setSessionExpiredHandler(() => {});
  }, []);

  // Bootstrap: exactly one refresh, before anything renders behind the guard. The cookie is
  // HttpOnly, so there is no way to know whether a session exists without asking.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_ACTING_USER_KEY);
    } catch {
      // Private mode, or storage disabled. Nothing here is load-bearing.
    }

    let cancelled = false;
    void refreshSession().then((result) => {
      if (cancelled) return;
      if (result) adopt(result);
      else setStatus('anonymous');
    });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const login = useCallback(
    async (email: string, password: string) => {
      adopt(await api.auth.login(email, password));
    },
    [adopt],
  );

  const logout = useCallback(
    async (allSessions = false) => {
      try {
        await api.auth.logout(allSessions);
      } finally {
        // Even if the call fails, the local session is over as far as this tab is concerned —
        // leaving the user apparently signed in after they clicked Log out is the worse outcome.
        forget();
      }
    },
    [forget],
  );

  const value = useMemo<AuthState>(
    () => ({ status, user, memberships, expired, login, logout, adopt, clearExpired: () => setExpired(false) }),
    [status, user, memberships, expired, login, logout, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
