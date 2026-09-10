import { useNavigate, useParams } from '@tanstack/react-router';
import { useProjects } from '../api/queries';
import { useAuth } from '../auth/AuthProvider';
import { useDismissable } from './useDismissable';

/**
 * Spec 02: switching project is a **route change**, not local state, so a project view is a
 * shareable link and survives refresh. The prototype's switcher changed nothing at all.
 *
 * Spec 10 §6: the list is the caller's memberships and nothing else. That filtering is the
 * server's (`GET /projects` joins `project_members`), not this component's — a client-side
 * filter would still have fetched every project's name first, which is the leak R12 forbids.
 */
export function ProjectSwitcher() {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: projects = [], isPending } = useProjects();
  const { ref, open, setOpen, toggle } = useDismissable<HTMLDivElement>();

  const current = projects.find((p) => p.id === projectId);
  const empty = !isPending && projects.length === 0;
  const label = current?.name ?? (isPending ? 'Loading…' : empty ? 'No projects' : 'Select project');

  return (
    <div ref={ref} className="relative px-2 pb-4 pt-1.5">
      <div className="mb-2 pl-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
        Lumen Labs
      </div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left hover:bg-white/[0.06]"
      >
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-gradient-to-br from-indigo-500 to-indigo-700 text-[13px] font-bold text-white">
          {current?.keyPrefix.slice(0, 1) ?? '·'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[0.2px]">{label}</span>
        <span className="flex-none text-[10px] text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full z-20 mt-1 rounded-[9px] border border-white/10 bg-[#1c1f2a] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          {/* A platform admin sees every project without a membership row, so say so rather than
              letting the list silently mean something different for them (spec 10 §6). */}
          {user?.role === 'admin' && !empty && (
            <div className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-wider text-slate-500">
              All projects · platform admin
            </div>
          )}

          {empty ? (
            <p className="px-2.5 py-3 text-[12.5px] leading-[1.5] text-slate-400">
              You're not a member of any project yet. Ask an administrator to add you to one.
            </p>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: '/projects/$projectId/overview', params: { projectId: project.id } });
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] text-slate-200 hover:bg-white/10"
              >
                <span className="truncate">{project.name}</span>
                <span className="flex flex-none items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500">{project.keyPrefix}</span>
                  {project.id === projectId && <span className="text-[12px] text-indigo-400">✓</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
