import { useParams } from '@tanstack/react-router';
import { ROLE_COLORS, type User, type UserStatus, type UserUpdateDto } from '@ticket-tracker/shared';
import { useEffect, useMemo, useState } from 'react';
import { useUpdateUser, useUser } from '../../api/queries';
import { ErrorPanel, LoadingPanel } from '../../components/states';
import { initials } from '../../layout/useDismissable';
import { useAuth } from '../../auth/AuthProvider';
import { useCanPlatform } from '../../auth/useCan';
import { UserFields } from './UserFields';
import { changedFields, formFromUser, validate } from './userForm';

export function UserDetailPage() {
  const { userId } = useParams({ from: '/_authed/projects/$projectId/people/$userId' });
  const { data: user, isPending, error, refetch } = useUser(userId);

  if (isPending) return <LoadingPanel label="Loading user…" />;
  if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;
  return <Loaded user={user} />;
}

function Loaded({ user }: { user: User }) {
  const [form, setForm] = useState(() => formFromUser(user));
  const [submitted, setSubmitted] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  // Spec 07: only an Admin may edit. Everyone else sees the read-only summary below.
  const canManage = useCanPlatform('user.manage');
  const { user: signedIn } = useAuth();

  // Disabling yourself would end your own session on the next request (R15) and, if you are the
  // last admin, orphan the platform (R18) — the API refuses the second and would happily do the
  // first. Not offering it is kinder than explaining it afterwards.
  const canSetStatus = canManage && signedIn?.id !== user.id;

  const update = useUpdateUser();
  const errors = useMemo(() => validate(form, 'update'), [form]);
  const patch = useMemo(() => changedFields(form, user), [form, user]);
  const isDirty = Object.keys(patch).length > 0;

  // Re-seed after a save, or when switching to another user's page.
  useEffect(() => setForm(formFromUser(user)), [user.id, user.name, user.email, user.department, user.role]);

  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(0), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const save = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !isDirty) return;
    update.mutate({ id: user.id, body: patch as UserUpdateDto }, { onSuccess: () => setSavedAt(Date.now()) });
  };

  const role = ROLE_COLORS[user.role];

  return (
    <div className="max-w-[520px] px-8 pb-14 pt-[26px]">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-[22px] flex items-center gap-3.5">
          <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-indigo-100 text-[18px] font-bold text-indigo-700">
            {initials(user.name)}
          </span>
          <div>
            <div className="text-[18px] font-bold">{user.name}</div>
            <span
              className="inline-block rounded-lg px-2 py-0.5 text-[11px] font-semibold capitalize"
              style={{ background: role.bg, color: role.fg }}
            >
              {user.role}
            </span>
          </div>
        </div>

        {canManage && (
          <>
            <UserFields
              form={form}
              errors={submitted ? errors : {}}
              onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
            />

            {update.isError && (
              <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
                {(update.error as Error).message}
              </p>
            )}

            <button
              type="button"
              onClick={save}
              // Spec 07 notes the prototype always allowed save; a dirty check is strictly
              // better and matches the ticket detail's behaviour (M11).
              disabled={!isDirty || update.isPending}
              className={`mt-[18px] rounded-lg px-4 py-2.5 text-[12.5px] font-semibold ${
                isDirty && !update.isPending
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : savedAt
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'cursor-default bg-slate-100 text-slate-400'
              }`}
            >
              {update.isPending ? 'Saving…' : savedAt && !isDirty ? 'Saved ✓' : 'Save changes'}
            </button>
          </>
        )}

        {canSetStatus && <StatusControl user={user} />}

        <dl className="mt-5 flex flex-col gap-2 rounded-[10px] bg-slate-50 px-4 py-3.5 text-[12.5px] text-slate-600">
          {/* Null for anyone but a platform admin and the person themselves (tech spec §4.4). */}
          <Row term="Email">{user.email ?? <span className="text-slate-400">hidden</span>}</Row>
          <Row term="Department">{user.department}</Row>
          <Row term="Role"><span className="capitalize">{user.role}</span></Row>
          <Row term="Status"><StatusBadge status={user.status} /></Row>
        </dl>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<UserStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  invited: 'bg-amber-100 text-amber-800',
  disabled: 'bg-slate-200 text-slate-600',
};

const StatusBadge = ({ status }: { status: UserStatus }) => (
  <span className={`rounded-lg px-1.5 py-0.5 text-[10.5px] font-semibold capitalize ${STATUS_STYLE[status]}`}>
    {status}
  </span>
);

/**
 * Disable / re-enable an account (spec 10 §4.4). Disabling revokes every session the person has
 * and takes effect on their **next request**, not when their token expires (R15) — the copy says
 * so, because "they're logged out eventually" is what people assume and it isn't what happens.
 *
 * Re-enabling restores access only if they still have a password; an account disabled while
 * still `invited` goes back to `invited`, not to `active`.
 */
function StatusControl({ user }: { user: User }) {
  const update = useUpdateUser();
  const disabled = user.status === 'disabled';

  const setStatus = (status: UserStatus) => update.mutate({ id: user.id, body: { status } });

  return (
    <div className="mt-5 rounded-[10px] border border-slate-200 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-slate-700">
            {disabled ? 'Account disabled' : 'Account access'}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-slate-500">
            {disabled
              ? 'They cannot sign in. Re-enabling restores access from their next sign-in.'
              : 'Disabling signs them out of every device immediately and blocks new sign-ins.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStatus(disabled ? 'active' : 'disabled')}
          disabled={update.isPending}
          className={`flex-none rounded-[7px] border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40 ${
            disabled
              ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
              : 'border-rose-300 text-rose-700 hover:bg-rose-50'
          }`}
        >
          {update.isPending ? 'Saving…' : disabled ? 'Re-enable' : 'Disable'}
        </button>
      </div>
      {update.isError && (
        <p className="mt-2 text-[12px] text-rose-700">{(update.error as Error).message}</p>
      )}
    </div>
  );
}

const Row = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-400">{term}</dt>
    <dd className="truncate">{children}</dd>
  </div>
);
