import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { checkPassword, PASSWORD_ISSUE_MESSAGES, PASSWORD_MIN_LENGTH, type PasswordIssue } from '@ticket-tracker/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import { useAuth } from './AuthProvider';
import { AuthLayout, fieldClass, labelClass, submitClass } from './AuthLayout';

/** The checklist runs the same `checkPassword` the server does — one policy, two renderings. */
const CHECKS: { issue: PasswordIssue; label: string }[] = [
  { issue: 'too_short', label: `At least ${PASSWORD_MIN_LENGTH} characters` },
  { issue: 'contains_identifier', label: 'Not based on your email address' },
  { issue: 'too_common', label: 'Not a commonly used password' },
];

/**
 * Spec 10 §6: `/invite/:token`. Shows who the invite is for, a password field with a live policy
 * checklist, and a confirm field. Accepting signs the person straight in — the API returns a
 * session, so bouncing them to `/login` to type the password again would be theatre.
 */
export function AcceptInvitePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const { adopt } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.auth.invitePreview(token),
    retry: false,
  });

  const issues = checkPassword(password, { email: invite.data?.email });
  const failed = new Set(issues);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length > 0 && issues.length === 0 && confirm === password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      adopt(await api.auth.acceptInvite(token, password));
      navigate({ to: '/', replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  };

  if (invite.isPending) {
    return <AuthLayout title="Lumen Labs"><p className="text-center text-[13px] text-slate-400">Checking your invite…</p></AuthLayout>;
  }

  if (invite.isError) {
    return (
      <AuthLayout title="This link isn't valid">
        <p className="text-[13px] leading-[1.6] text-slate-300">
          {invite.error instanceof ApiError
            ? invite.error.message
            : 'This invite link is no longer valid. Ask an administrator to send you a new one.'}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set your password"
      subtitle={
        <>
          You were invited to Lumen Labs as <span className="text-slate-200">{invite.data.email}</span>.
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <div className="mb-4">
          <label className={labelClass} htmlFor="new-password">
            Choose a password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>

        <ul className="mb-4 space-y-1">
          {CHECKS.map((check) => {
            const ok = password.length > 0 && !failed.has(check.issue);
            return (
              <li key={check.issue} className={`flex items-center gap-2 text-[12px] ${ok ? 'text-emerald-300' : 'text-slate-400'}`}>
                <span aria-hidden className="w-3 flex-none text-center">{ok ? '✓' : '·'}</span>
                {/* The server's own wording once a rule is actually broken, so the two can't drift. */}
                {failed.has(check.issue) && password.length > 0 ? PASSWORD_ISSUE_MESSAGES[check.issue] : check.label}
              </li>
            );
          })}
        </ul>

        <div className="mb-5">
          <label className={labelClass} htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={fieldClass}
          />
          {mismatch && <p className="mt-1.5 text-[12px] text-rose-300">Passwords don't match.</p>}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-[12.5px] leading-[1.5] text-rose-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={!ready || pending} className={submitClass}>
          {pending ? 'Setting up…' : 'Set password and sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
