import { ROLE_COLORS } from '@ticket-tracker/shared';
import { useEffect } from 'react';
import { useUsers } from '../api/queries';
import { useActingUserStore } from '../store/actingUser';
import { initials, useDismissable } from './useDismissable';

/**
 * The "acting as" switcher (spec 08) — the prototype's demo user-switcher, renamed. Whoever is
 * selected is sent as `X-Acting-User-Id` on every mutation, which is what the server's role
 * checks act on. Not a login: there's no proof the request is really that person.
 */
export function ActingUserMenu() {
  const { data: users = [] } = useUsers();
  const { actingUserId, setActingUser } = useActingUserStore();
  const { ref, open, setOpen, toggle } = useDismissable<HTMLDivElement>();

  // Default to the first user so the app is usable immediately, and recover if a persisted id
  // no longer exists (e.g. the database was reseeded since the last visit).
  useEffect(() => {
    if (users.length === 0) return;
    if (!actingUserId || !users.some((u) => u.id === actingUserId)) {
      setActingUser(users[0].id);
    }
  }, [users, actingUserId, setActingUser]);

  const current = users.find((u) => u.id === actingUserId);

  return (
    <div ref={ref} className="relative mt-2.5 border-t border-white/[0.08] pt-2.5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left hover:bg-white/[0.06]"
      >
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-slate-200">
          {current ? initials(current.name) : '··'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] text-slate-200">{current?.name ?? 'Loading…'}</span>
          {current && (
            <span
              className="inline-block rounded-lg px-1.5 text-[9.5px] font-semibold capitalize"
              style={{ background: ROLE_COLORS[current.role].bg, color: ROLE_COLORS[current.role].fg }}
            >
              {current.role}
            </span>
          )}
        </span>
        <span className="flex-none text-[10px] text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-1 right-1 z-20 mb-1 rounded-[9px] border border-white/10 bg-[#1c1f2a] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            Acting as (no real auth)
          </div>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                setActingUser(user.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] text-slate-200 hover:bg-white/10"
            >
              <span className="truncate">{user.name}</span>
              <span className="flex flex-none items-center gap-1.5">
                <span className="text-[10px] capitalize text-slate-500">{user.role}</span>
                {user.id === actingUserId && <span className="text-[12px] text-indigo-400">✓</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
