import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from './AuthProvider';
import { AuthLayout, fieldClass, labelClass, submitClass } from './AuthLayout';

/**
 * Spec 10 §6: email, password, submit, and one error line. No sign-up link and no password-reset
 * link — neither exists, and offering one would be a dead end. A forgotten password is handled
 * by an admin re-issuing an invite (spec 10 §4.4).
 */
export function LoginPage() {
  const { status, login, expired, clearExpired } = useAuth();
  const navigate = useNavigate();
  const { next } = useSearch({ strict: false }) as { next?: string };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Covers both signing in here and arriving with a session already live (a second tab, or the
  // back button after logging in elsewhere).
  useEffect(() => {
    if (status === 'authenticated') {
      navigate({ to: next || '/', replace: true });
    }
  }, [status, next, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    clearExpired();
    try {
      await login(email.trim(), password);
      // Navigation happens in the effect above, once status flips.
    } catch (err) {
      // The API answers every failure — unknown email, wrong password, invited, disabled — with
      // one message on purpose (spec 10 §4.2). Showing it verbatim keeps that promise; inventing
      // a friendlier, more specific one here would undo it.
      setError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : 'Could not reach the server. Check your connection and try again.',
      );
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Sign in to Lumen Labs">
      <form onSubmit={submit} noValidate>
        {expired && (
          <p className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200">
            Your session expired — please sign in again.
          </p>
        )}

        <div className="mb-4">
          <label className={labelClass} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            placeholder="you@nimbus.io"
          />
        </div>

        <div className="mb-5">
          <label className={labelClass} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>

        {error && (
          <p role="alert" className="mb-4 text-[12.5px] leading-[1.5] text-rose-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending || !email.trim() || !password} className={submitClass}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
