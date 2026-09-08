import { DEPARTMENTS, USER_ROLES } from '@ticket-tracker/shared';
import type { ReactNode } from 'react';
import type { UserForm } from './userForm';

const inputClass = 'w-full rounded-lg border px-2.5 py-2 text-[13.5px] outline-none';

export const Label = ({ children }: { children: ReactNode }) => (
  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400">{children}</div>
);

export const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="mt-1 text-[12px] text-rose-700">{message}</p> : null;

/** The four editable fields, shared by the create form and the detail edit (spec 07). */
export function UserFields({
  form,
  errors,
  onChange,
}: {
  form: UserForm;
  errors: Record<string, string>;
  onChange: <K extends keyof UserForm>(field: K, value: string) => void;
}) {
  return (
    <>
      <Label>Name</Label>
      <input
        value={form.name}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="Full name"
        className={`${inputClass} ${errors.name ? 'border-rose-300' : 'border-slate-200'}`}
      />
      <FieldError message={errors.name} />

      <div className="mt-4">
        <Label>Email</Label>
        <input
          value={form.email}
          onChange={(e) => onChange('email', e.target.value)}
          placeholder="name@nimbus.io"
          className={`${inputClass} ${errors.email ? 'border-rose-300' : 'border-slate-200'}`}
        />
        <FieldError message={errors.email} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <Label>Department</Label>
          <select
            value={form.department}
            onChange={(e) => onChange('department', e.target.value)}
            className={`${inputClass} border-slate-200`}
          >
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <FieldError message={errors.department} />
        </div>
        <div>
          <Label>Role</Label>
          <select
            value={form.role}
            onChange={(e) => onChange('role', e.target.value)}
            className={`${inputClass} border-slate-200 capitalize`}
          >
            {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <FieldError message={errors.role} />
        </div>
      </div>
    </>
  );
}
