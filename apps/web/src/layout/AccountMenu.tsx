import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ROLE_COLORS } from '@ticket-tracker/shared';
import { useAuth } from '../auth/AuthProvider';
import { initials, useDismissable } from './useDismissable';

/**
 * The signed-in person and their account actions (spec 10 §6).
 *
 * Replaces v1's `ActingUserMenu`, and the difference is not cosmetic: that menu let anyone
 * *become* anyone by picking from a list, because the server trusted a header. There is nothing
 * to pick from here — this shows who you are, and the only way to be someone else is to sign in
 * as them.
 */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const navigate = useNavigate();
  const { ref, open, setOpen, toggle } = useDismissable<HTMLDivElement>();

  if (!user) return null;

  const signOut = async (allSessions: boolean) => {
    setOpen(false);
    await logout(allSessions);
    navigate({ to: '/login', replace: true });
  };

  const itemClass = 'block w-full rounded-md px-2.5 py-2 text-left text-[13px] text-slate-200 hover:bg-white/10';

  return (
    <div ref={ref} className="relative mt-2.5 border-t border-white/[0.08] pt-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left hover:bg-white/[0.06]"
      >
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-slate-200">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] text-slate-200">{user.name}</span>
          <span
            className="inline-block rounded-lg px-1.5 text-[9.5px] font-semibold capitalize"
            style={{ background: ROLE_COLORS[user.role].bg, color: ROLE_COLORS[user.role].fg }}
          >
            {user.role}
          </span>
        </span>
        <span className="flex-none text-[10px] text-slate-500">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-1 right-1 z-20 mb-1 rounded-[9px] border border-white/10 bg-[#1c1f2a] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          <div className="truncate px-2.5 pb-1.5 pt-1 text-[11px] text-slate-500">{user.email}</div>

          {/* Only offered inside a project — the profile page lives under the project route tree. */}
          {projectId && (
            <Link
              to="/projects/$projectId/people/$userId"
              params={{ projectId, userId: user.id }}
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              Your profile
            </Link>
          )}
          <Link to="/account/password" onClick={() => setOpen(false)} className={itemClass}>
            Change password
          </Link>
          <Link to="/account/sessions" onClick={() => setOpen(false)} className={itemClass}>
            Active sessions
          </Link>

          <div className="my-1 border-t border-white/[0.08]" />

          <button type="button" onClick={() => void signOut(false)} className={itemClass}>
            Log out
          </button>
          <button type="button" onClick={() => void signOut(true)} className={itemClass}>
            Log out everywhere
          </button>
        </div>
      )}
    </div>
  );
}
