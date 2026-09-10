import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  /** Populated by the AuthGuard once a token verifies; null for anonymous requests. */
  userId?: string | null;
  /** Set on project-scoped routes by ProjectScopeGuard. */
  projectId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Ambient per-request context (spec 11 §2).
 *
 * The alternative — threading a requestId through every service signature — was rejected because
 * it would touch every handler in the codebase to serve logging, and would be silently dropped
 * the first time someone added a method without it. AsyncLocalStorage survives every `await`.
 */
export const requestContext = {
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  /** The id, or `'-'` when called outside a request (a job, a boot-time log). */
  requestId(): string {
    return storage.getStore()?.requestId ?? '-';
  },

  /**
   * Enrich the current context in place. Called by the guards once identity is known, so log
   * lines emitted later in the request carry the user without re-deriving it.
   */
  set(patch: Partial<RequestContext>): void {
    const store = storage.getStore();
    if (store) Object.assign(store, patch);
  },
};
