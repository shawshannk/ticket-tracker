import { userCreateSchema, userUpdateSchema, type User } from '@ticket-tracker/shared';

export interface UserForm {
  name: string;
  email: string;
  department: string;
  role: string;
}

export const emptyUserForm = (): UserForm => ({ name: '', email: '', department: 'Engineering', role: 'developer' });

export const formFromUser = (user: User): UserForm => ({
  name: user.name,
  email: user.email,
  department: user.department,
  role: user.role,
});

/** Only what changed, so a PATCH never rewrites untouched columns (same rule as M11). */
export function changedFields(form: UserForm, user: User): Partial<UserForm> {
  const original = formFromUser(user);
  const patch: Record<string, string> = {};
  for (const key of Object.keys(form) as (keyof UserForm)[]) {
    if (form[key] !== original[key]) patch[key] = form[key];
  }
  return patch;
}

/** Validates with the same schemas the API enforces, as the ticket form does (M12). */
export function validate(form: UserForm, mode: 'create' | 'update'): Record<string, string> {
  const schema = mode === 'create' ? userCreateSchema : userUpdateSchema;
  const result = schema.safeParse(form);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}
