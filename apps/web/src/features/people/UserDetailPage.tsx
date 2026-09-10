import { useParams } from '@tanstack/react-router';
import { ROLE_COLORS, type User, type UserUpdateDto } from '@ticket-tracker/shared';
import { useEffect, useMemo, useState } from 'react';
import { useUpdateUser, useUser } from '../../api/queries';
import { ErrorPanel, LoadingPanel } from '../../components/states';
import { initials } from '../../layout/useDismissable';
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

        <dl className="mt-5 flex flex-col gap-2 rounded-[10px] bg-slate-50 px-4 py-3.5 text-[12.5px] text-slate-600">
          <Row term="Email">{user.email}</Row>
          <Row term="Department">{user.department}</Row>
          <Row term="Role"><span className="capitalize">{user.role}</span></Row>
        </dl>
      </div>
    </div>
  );
}

const Row = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-400">{term}</dt>
    <dd className="truncate">{children}</dd>
  </div>
);
