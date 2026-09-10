import { Navigate, Outlet, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuth } from './AuthProvider';

/**
 * The gate on every authenticated route (spec 10 §6).
 *
 * **The `loading` branch is the whole reason a reload doesn't flash the login page.** The refresh
 * cookie is HttpOnly, so on a cold load there is no way to know whether a session exists without
 * asking the server; until `AuthProvider`'s single bootstrap refresh answers, we are neither
 * signed in nor signed out, and rendering a redirect during that gap would bounce every returning
 * user through `/login` for a frame.
 *
 * Implemented as a component rather than a router `beforeLoad`, because the decision depends on
 * async React state that a synchronous loader guard cannot see without duplicating the bootstrap.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const router = useRouter();

  // Read once, on first render, and never again. Subscribing to live router state here — via
  // `useRouterState` — re-rendered this component on the very navigation it had just triggered,
  // so it issued another `<Navigate>` with `next` now pointing at `/login?next=…`, and then
  // another, until the tab ran out of memory and crashed. What we want is the URL the person
  // originally asked for, which by definition does not change.
  const [intended] = useState(() => router.state.location.href);

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#12141c] text-[13px] text-slate-500">
        Loading…
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" search={{ next: intended }} replace />;
  }

  return <Outlet />;
}
