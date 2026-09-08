import { useNavigate, useParams } from '@tanstack/react-router';
import { can, type UserCreateDto } from '@ticket-tracker/shared';
import { useMemo, useState } from 'react';
import { useCreateUser, useUsers } from '../../api/queries';
import { useActingUserStore } from '../../store/actingUser';
import { UserFields } from './UserFields';
import { emptyUserForm, validate } from './userForm';

/** Spec 07: Admin-only. Submitting navigates to the new user's detail view. */
export function CreateUserPage() {
  const { projectId } = useParams({ from: '/projects/$projectId/people/new' });
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyUserForm);
  const [submitted, setSubmitted] = useState(false);

  const { data: users = [] } = useUsers();
  const actingUserId = useActingUserStore((s) => s.actingUserId);
  const canManage = can('manageUsers', users.find((u) => u.id === actingUserId)?.role);

  const create = useCreateUser();
  const errors = useMemo(() => validate(form, 'create'), [form]);

  // Reachable by typing the URL even when the acting user can't use it — the server would
  // reject the POST anyway, but saying so is better than a form that fails on submit.
  if (!canManage) {
    return (
      <div className="max-w-[520px] px-8 pt-[30px]">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Only an Admin can add team members. Switch the acting user in the sidebar.
        </p>
      </div>
    );
  }

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    create.mutate(form as UserCreateDto, {
      onSuccess: (user) =>
        navigate({ to: '/projects/$projectId/people/$userId', params: { projectId, userId: user.id } }),
    });
  };

  return (
    <div className="max-w-[520px] px-8 pb-14 pt-[30px]">
      <div className="rounded-xl border border-slate-200 bg-white p-[26px]">
        <UserFields
          form={form}
          errors={submitted ? errors : {}}
          onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        />

        {create.isError && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
            {(create.error as Error).message}
          </p>
        )}

        <div className="mt-[22px] flex justify-end gap-2.5 border-t border-slate-100 pt-[18px]">
          <button
            type="button"
            onClick={() => navigate({ to: '/projects/$projectId/people', params: { projectId } })}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            className="rounded-lg bg-indigo-600 px-[18px] py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  );
}
