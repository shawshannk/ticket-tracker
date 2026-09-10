import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { relativeTime } from '../components/relativeTime';
import { ErrorPanel, LoadingPanel } from '../components/states';

/**
 * Spec 10 §4.3 / §6: where this account is signed in, and a way to end any of it.
 *
 * The current session is listed but never offered a Revoke button — signing yourself out from
 * here would look like a bug, and "Log out" in the account menu is the control that means that.
 */
export function SessionsPage() {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: api.auth.sessions });

  const revoke = useMutation({
    mutationFn: (id: string) => api.auth.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });

  if (sessions.isPending) return <LoadingPanel />;
  if (sessions.isError) return <ErrorPanel error={sessions.error} onRetry={() => sessions.refetch()} />;

  return (
    <div className="mx-auto max-w-[720px] p-7">
      <p className="mb-5 text-[13px] leading-[1.6] text-slate-500">
        Signing out of a session ends it immediately — the next request from that device is refused,
        not merely when its token would have expired.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {sessions.data.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium text-slate-800">
                  {session.userAgent ?? 'Unknown device'}
                </span>
                {session.current && (
                  <span className="flex-none rounded-lg bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    This device
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11.5px] text-slate-400">
                {session.ip ?? 'no address recorded'} · signed in {relativeTime(session.issuedAt)}
              </div>
            </div>

            {!session.current && (
              <button
                type="button"
                onClick={() => revoke.mutate(session.id)}
                disabled={revoke.isPending}
                className="flex-none rounded-[7px] border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-rose-300 hover:text-rose-700 disabled:opacity-40"
              >
                Sign out
              </button>
            )}
          </div>
        ))}
      </div>

      {revoke.isError && (
        <p className="mt-3 text-[12.5px] text-rose-700">{(revoke.error as Error).message}</p>
      )}
    </div>
  );
}
