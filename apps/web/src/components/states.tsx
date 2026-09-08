import type { ReactNode } from 'react';

export function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return <div className="p-8 text-[13px] text-slate-500">{label}</div>;
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="m-8 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-[13px] text-rose-800">
      <div className="font-semibold">Couldn’t load this view</div>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2.5 rounded-md border border-rose-300 bg-white px-2.5 py-1 font-medium hover:bg-rose-100">
          Try again
        </button>
      )}
    </div>
  );
}

/** Spec 01 asks for a real empty state rather than a blank list. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-2 py-6 text-center text-[12.5px] text-slate-400">{children}</div>;
}
