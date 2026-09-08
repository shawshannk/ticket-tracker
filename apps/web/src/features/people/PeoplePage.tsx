import { Link, useParams } from '@tanstack/react-router';
import { can, ROLE_COLORS } from '@ticket-tracker/shared';
import { useUsers } from '../../api/queries';
import { ErrorPanel, LoadingPanel } from '../../components/states';
import { initials } from '../../layout/useDismissable';
import { useActingUserStore } from '../../store/actingUser';

/**
 * Spec 07. Users are global, not project-scoped (spec 00), but the view lives under the
 * project route so the sidebar keeps its context.
 */
export function PeoplePage() {
  const { projectId } = useParams({ from: '/projects/$projectId/people' });
  const { data: users, isPending, error, refetch } = useUsers();

  const actingUserId = useActingUserStore((s) => s.actingUserId);
  const actingRole = users?.find((u) => u.id === actingUserId)?.role;
  // Spec 07: "Add team member" is Admin-only. Hiding it is UX; the server enforces it (R3).
  const canManage = can('manageUsers', actingRole);

  if (isPending) return <LoadingPanel label="Loading people…" />;
  if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;

  return (
    <div className="max-w-[900px] px-8 pb-14 pt-[22px]">
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Link
            to="/projects/$projectId/people/new"
            params={{ projectId }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700"
          >
            <span className="text-[15px] leading-none">+</span> Add team member
          </Link>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[36px_1fr_1fr_140px] gap-2.5 border-b border-slate-200 px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400">
          <div />
          <div>Name</div>
          <div>Department</div>
          <div>Role</div>
        </div>

        {users.map((user) => (
          <Link
            key={user.id}
            to="/projects/$projectId/people/$userId"
            params={{ projectId, userId: user.id }}
            className="grid grid-cols-[36px_1fr_1fr_140px] items-center gap-2.5 border-b border-slate-100 px-[18px] py-3 last:border-0 hover:bg-slate-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium text-slate-800">{user.name}</div>
              <div className="truncate text-[11.5px] text-slate-400">{user.email}</div>
            </div>
            <div className="truncate text-[12.5px] text-slate-600">{user.department}</div>
            <div>
              <span
                className="whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold capitalize"
                style={{ background: ROLE_COLORS[user.role].bg, color: ROLE_COLORS[user.role].fg }}
              >
                {user.role}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
