import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

/** Sidebar + topbar + scrolling content, matching the prototype's frame. */
export function AppShell({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900">
      <Sidebar />
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] flex-none items-center justify-between border-b border-slate-200 bg-white px-7">
          <div className="flex min-w-0 items-baseline gap-2.5 text-[17px] font-semibold tracking-[-0.2px]">{title}</div>
          {actions}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
