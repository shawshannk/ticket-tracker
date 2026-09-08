import { Link, useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ActingUserMenu } from './ActingUserMenu';
import { ProjectSwitcher } from './ProjectSwitcher';

const icon = (path: ReactNode) => (
  <svg
    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none opacity-85"
  >
    {path}
  </svg>
);

const NAV = [
  { to: '/projects/$projectId/overview', label: 'Overview', icon: icon(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>) },
  { to: '/projects/$projectId/tickets', label: 'Tickets', icon: icon(<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>) },
  { to: '/projects/$projectId/board', label: 'Board', icon: icon(<><rect x="3" y="3" width="6" height="18" /><rect x="10" y="3" width="6" height="12" /><rect x="17" y="3" width="4" height="8" /></>) },
  { to: '/projects/$projectId/people', label: 'People', icon: icon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>) },
] as const;

export function Sidebar() {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };

  return (
    <nav className="flex w-[216px] flex-none flex-col gap-1 bg-[#12141c] p-5 px-3.5 text-slate-200">
      <ProjectSwitcher />

      {NAV.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          params={{ projectId: projectId ?? '' }}
          disabled={!projectId}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-slate-300 hover:bg-white/[0.06] aria-[current=page]:bg-white/10 aria-[current=page]:text-white"
          activeProps={{ 'aria-current': 'page' }}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}

      <Link
        to="/projects/$projectId/create"
        params={{ projectId: projectId ?? '' }}
        disabled={!projectId}
        className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="flex-none">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        New Ticket
      </Link>

      <div className="flex-1" />
      <ActingUserMenu />
    </nav>
  );
}
