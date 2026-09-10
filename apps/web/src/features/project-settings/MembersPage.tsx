import { useParams } from '@tanstack/react-router';
import { ROLE_COLORS, USER_ROLES, type UserRole } from '@ticket-tracker/shared';
import { useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import { useAddMember, useMembers, useRemoveMember, useUpdateMember, useUsers } from '../../api/queries';
import { useAuth } from '../../auth/AuthProvider';
import { useCan } from '../../auth/useCan';
import { ErrorPanel, LoadingPanel } from '../../components/states';
import { initials } from '../../layout/useDismissable';

/**
 * Project settings → Members (spec 10 §4.5, §6).
 *
 * The role shown and edited here is the **project** role, which overrides the global one inside
 * this project and usually differs from it (R13) — so both are on screen. Managing members needs
 * `project.members.manage`, which is itself a project permission: a global manager who is only a
 * developer here sees the table read-only, and the server agrees.
 */
export function MembersPage() {
  const { projectId } = useParams({ from: '/_authed/projects/$projectId/settings/members' });
  const { user } = useAuth();
  const canManage = useCan('project.members.manage');

  const members = useMembers(projectId);
  const { data: directory = [] } = useUsers();

  const [pickedUserId, setPickedUserId] = useState('');
  const [pickedRole, setPickedRole] = useState<UserRole>('developer');

  const add = useAddMember(projectId);
  const update = useUpdateMember(projectId);
  const remove = useRemoveMember(projectId);

  // Only people who aren't already members, so the picker can't produce a 409.
  const addable = useMemo(() => {
    const current = new Set((members.data ?? []).map((m) => m.userId));
    return directory.filter((u) => !current.has(u.id) && u.status !== 'disabled');
  }, [directory, members.data]);

  /**
   * R18, mirrored in the UI. The server refuses either way — this only stops the person
   * discovering it by being refused.
   */
  const admins = (members.data ?? []).filter((m) => m.role === 'admin');
  const isLastAdmin = (role: UserRole) => role === 'admin' && admins.length === 1;

  const error = [add.error, update.error, remove.error].find(Boolean);

  if (members.isPending) return <LoadingPanel label="Loading members…" />;
  if (members.isError) return <ErrorPanel error={members.error} onRetry={() => members.refetch()} />;

  const submitAdd = () => {
    if (!pickedUserId) return;
    add.mutate({ userId: pickedUserId, role: pickedRole }, { onSuccess: () => setPickedUserId('') });
  };

  return (
    <div className="max-w-[860px] px-8 pb-14 pt-[22px]">
      <p className="mb-5 text-[13px] leading-[1.6] text-slate-500">
        Members can see everything in this project. Their role here overrides their global role —
        someone can be a manager on one project and a developer on another. Removing a member takes
        effect on their next request; their tickets and comments stay.
      </p>

      {canManage && (
        <div className="mb-5 flex flex-wrap items-end gap-2.5 rounded-xl border border-slate-200 bg-white p-4">
          <div className="min-w-[220px] flex-1">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400">
              Add a member
            </div>
            <select
              value={pickedUserId}
              onChange={(e) => {
                setPickedUserId(e.target.value);
                // Spec 10 §4.5: default the project role to their global one.
                const picked = directory.find((u) => u.id === e.target.value);
                if (picked) setPickedRole(picked.role);
              }}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13.5px] outline-none focus:border-indigo-300"
            >
              <option value="">Choose someone…</option>
              {addable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.department}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400">
              Project role
            </div>
            <select
              value={pickedRole}
              onChange={(e) => setPickedRole(e.target.value as UserRole)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-[13.5px] capitalize outline-none focus:border-indigo-300"
            >
              {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={submitAdd}
            disabled={!pickedUserId || add.isPending}
            className="rounded-[7px] bg-indigo-600 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {add.isPending ? 'Adding…' : 'Add member'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-800">
          {error instanceof ApiError ? error.message : 'Something went wrong.'}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {members.data.map((member) => {
          const lastAdmin = isLastAdmin(member.role);
          return (
            <div
              key={member.userId}
              className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                {initials(member.name)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-slate-800">{member.name}</span>
                  {member.userId === user?.id && (
                    <span className="flex-none text-[10.5px] text-slate-400">you</span>
                  )}
                </div>
                <div className="text-[11.5px] text-slate-400">
                  {member.department} · {member.globalRole} across the platform
                </div>
              </div>

              {canManage ? (
                <select
                  value={member.role}
                  disabled={update.isPending}
                  onChange={(e) => update.mutate({ userId: member.userId, body: { role: e.target.value as UserRole } })}
                  className="flex-none rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] capitalize outline-none focus:border-indigo-300 disabled:opacity-50"
                >
                  {USER_ROLES.map((r) => (
                    // Demoting the last admin would orphan the project (R18).
                    <option key={r} value={r} disabled={lastAdmin && r !== 'admin'}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className="flex-none rounded-lg px-2 py-0.5 text-[10.5px] font-semibold capitalize"
                  style={{ background: ROLE_COLORS[member.role].bg, color: ROLE_COLORS[member.role].fg }}
                >
                  {member.role}
                </span>
              )}

              {canManage && (
                <button
                  type="button"
                  disabled={lastAdmin || remove.isPending}
                  title={lastAdmin ? 'A project must keep at least one admin.' : undefined}
                  onClick={() => remove.mutate(member.userId)}
                  className="flex-none rounded-[7px] border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!canManage && (
        <p className="mt-3 text-[12px] text-slate-400">
          Only a project manager or admin can change membership.
        </p>
      )}
    </div>
  );
}
