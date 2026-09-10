import { checkPassword, PASSWORD_ISSUE_MESSAGES, PASSWORD_MIN_LENGTH } from '@ticket-tracker/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import { useAuth } from './AuthProvider';

/**
 * Spec 10 §4.1: changing a password ends every *other* session (R15). The page says so before
 * the fact rather than surprising the person with signed-out devices afterwards.
 */
export function ChangePasswordPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const issues = checkPassword(next, { email: user?.email });
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && next.length > 0 && issues.length === 0 && confirm === next;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      await api.auth.changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-indigo-300';
  const label = 'mb-1.5 block text-[12px] font-medium text-slate-600';

  return (
    <div className="mx-auto max-w-[440px] p-7">
      <form onSubmit={submit} noValidate className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-5 text-[12.5px] leading-[1.6] text-slate-500">
          Changing your password signs you out everywhere else. This device stays signed in.
        </p>

        <div className="mb-4">
          <label className={label} htmlFor="current-password">Current password</label>
          <input
            id="current-password" type="password" autoComplete="current-password" required
            value={current} onChange={(e) => setCurrent(e.target.value)} className={field}
          />
        </div>

        <div className="mb-2">
          <label className={label} htmlFor="next-password">New password</label>
          <input
            id="next-password" type="password" autoComplete="new-password" required
            value={next} onChange={(e) => setNext(e.target.value)} className={field}
          />
        </div>
        <p className="mb-4 text-[11.5px] leading-[1.5] text-slate-400">
          {next.length > 0 && issues.length > 0
            ? PASSWORD_ISSUE_MESSAGES[issues[0]]
            : `At least ${PASSWORD_MIN_LENGTH} characters, not based on your email, not a common password.`}
        </p>

        <div className="mb-5">
          <label className={label} htmlFor="confirm-new-password">Confirm new password</label>
          <input
            id="confirm-new-password" type="password" autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field}
          />
          {mismatch && <p className="mt-1.5 text-[12px] text-rose-700">Passwords don't match.</p>}
        </div>

        {error && <p role="alert" className="mb-4 text-[12.5px] text-rose-700">{error}</p>}
        {done && <p className="mb-4 text-[12.5px] text-emerald-700">Password changed. Other devices have been signed out.</p>}

        <button
          type="submit"
          disabled={!ready || pending}
          className="rounded-[7px] bg-indigo-600 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {pending ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
