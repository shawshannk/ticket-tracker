import type { ReactNode } from 'react';

/** The signed-out frame: one centred card on the app's dark chrome colour. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#12141c] px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-indigo-700 text-[17px] font-bold text-white">
            L
          </div>
          <h1 className="text-[19px] font-semibold tracking-[-0.2px] text-white">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-[1.5] text-slate-400">{subtitle}</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1c1f2a] p-6">{children}</div>
      </div>
    </div>
  );
}

export const fieldClass =
  'w-full rounded-lg border border-white/10 bg-[#12141c] px-3 py-2.5 text-[13.5px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-400';

export const labelClass = 'mb-1.5 block text-[12px] font-medium text-slate-300';

export const submitClass =
  'w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-[13.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40';
