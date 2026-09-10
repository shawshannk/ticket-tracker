/**
 * The access token, held in a module-level variable (docs/auth-tech-spec.md §7).
 *
 * **Deliberately not `localStorage`, `sessionStorage`, or a persisted Zustand store.** Memory is
 * the point: spec 10 §8 accepts that an XSS bug can read anything the page can read, and the
 * mitigation chosen is that a token in a JS variable dies with the tab rather than sitting in
 * storage for every later script to find. Durability across reloads comes from the HttpOnly
 * refresh cookie instead, which script cannot read at all.
 *
 * Not React state either — `apiFetch` needs it synchronously, outside any component.
 */
let accessToken: string | null = null;

/**
 * Set once the session is known to be over, and cleared again by a successful sign-in. It exists
 * to make session expiry **one-shot**, which is not a nicety: see `notifySessionExpired`.
 */
let sessionIsDead = false;

export const getAccessToken = (): string | null => accessToken;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
  if (token) sessionIsDead = false;
};

/** True once a refresh has failed, until the next successful authentication. */
export const isSessionDead = (): boolean => sessionIsDead;

/**
 * Called when a refresh fails: the session is over and nothing should keep trying. AuthProvider
 * registers the handler, so `client.ts` never has to import the router or the auth context —
 * that import would be a cycle, since both of them call `apiFetch`.
 */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => {};

export const setSessionExpiredHandler = (handler: SessionExpiredHandler): void => {
  onSessionExpired = handler;
};

/**
 * Fires the handler **at most once per session**, and that guard is load-bearing.
 *
 * The handler clears the query cache, which makes every mounted query refetch, which 401s,
 * which lands back here. Without the latch that is an infinite loop — one that spins hot enough
 * to crash the tab before the redirect to `/login` ever completes. It is not a hypothetical:
 * it took down the e2e suite intermittently before this existed.
 */
export const notifySessionExpired = (): void => {
  accessToken = null;
  if (sessionIsDead) return;
  sessionIsDead = true;
  onSessionExpired();
};

/**
 * The refresh routine, registered by `refresh.ts` when it loads.
 *
 * This indirection exists so `client.ts` can import **only** this module. It previously reached
 * `refresh.ts` through a dynamic `import()` to dodge the import cycle (`refresh` calls
 * `apiFetch`), and under Vite's dev server that could resolve to a *second instance* of the
 * module — with its own `inFlight` promise, quietly defeating the single-flight guarantee and
 * firing two rotations for one expiry, which reuse detection reads as theft (R16). One module
 * with a registered callback has no cycle and no second instance.
 */
type RefreshHandler = () => Promise<unknown | null>;
let refreshHandler: RefreshHandler | null = null;

export const setRefreshHandler = (handler: RefreshHandler): void => {
  refreshHandler = handler;
};

export const runRefresh = async (): Promise<boolean> => {
  if (!refreshHandler) return false;
  return (await refreshHandler()) !== null;
};

/** Test seam: module state otherwise leaks between cases. */
export const resetTokenStoreForTests = (): void => {
  accessToken = null;
  sessionIsDead = false;
  onSessionExpired = () => {};
};
