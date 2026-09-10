import { Link, useParams } from '@tanstack/react-router';
import { PRIORITY_COLORS, STATUS_COLORS, type OverviewStats, type TicketSummary } from '@ticket-tracker/shared';
import { useOverview } from '../../api/queries';
import { StatusBadge } from '../../components/Badge';
import { relativeTime } from '../../components/relativeTime';
import { EmptyState, ErrorPanel, LoadingPanel } from '../../components/states';
import { useViewPrefs } from '../../store/viewPrefs';

/**
 * Spec 01 — read-only snapshot of a project. Every number arrives precomputed from
 * `GET /projects/:id/overview`; nothing here derives a statistic from a ticket list, which is
 * exactly the prototype behaviour the spec set out to replace.
 */
export function OverviewPage() {
  const { projectId } = useParams({ from: '/_authed/projects/$projectId/overview' });
  const { data, isPending, error, refetch } = useOverview(projectId);

  if (isPending) return <LoadingPanel label="Loading overview…" />;
  if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;

  return (
    <div className="max-w-[1180px] px-8 pb-14 pt-7">
      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open tickets" value={data.openCount} />
        <Kpi label="Critical & open" value={data.criticalOpen} tone="text-red-700" />
        <Kpi label="Avg. resolution" value={data.avgResolutionDays} suffix="days" />
        <Kpi label="Created this week" value={data.createdThisWeek} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="mb-4 text-[14px] font-semibold">Tickets by status</h2>
          <StatusBars breakdown={data.statusBreakdown} />

          <h2 className="mb-4 mt-[22px] text-[14px] font-semibold">Tickets by priority</h2>
          <div className="flex gap-2.5">
            {data.priorityBreakdown.map(({ priority, count }) => {
              const { fg, bg } = PRIORITY_COLORS[priority];
              return (
                <div key={priority} className="flex-1 rounded-[9px] px-2.5 py-3 text-center" style={{ background: bg }}>
                  <div className="text-[20px] font-bold" style={{ color: fg }}>{count}</div>
                  <div className="mt-0.5 whitespace-nowrap text-[11.5px] font-medium capitalize" style={{ color: fg }}>
                    {priority}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3.5 text-[14px] font-semibold">Recently updated</h2>
          {data.recentActivity.length === 0 ? (
            <EmptyState>No activity yet — create a ticket to get started.</EmptyState>
          ) : (
            data.recentActivity.map((ticket) => (
              <RecentRow key={ticket.id} ticket={ticket} projectId={projectId} />
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-[22px]">{children}</section>;
}

function Kpi({ label, value, suffix, tone }: { label: string; value: number; suffix?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-[18px]">
      <div className="mb-2 text-[12.5px] font-medium text-slate-500">{label}</div>
      <div className={`text-[28px] font-bold tracking-[-0.5px] ${tone ?? ''}`}>
        {value}
        {suffix && <span className="ml-1 text-[15px] font-medium text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

function StatusBars({ breakdown }: { breakdown: OverviewStats['statusBreakdown'] }) {
  // The API always returns every status, zero-filled. Showing only the used ones keeps an
  // active project readable; an untouched project would otherwise render nothing at all.
  const used = breakdown.filter((s) => s.count > 0);
  const rows = used.length > 0 ? used : breakdown;

  return (
    <div>
      {rows.map(({ status, count, pct }) => (
        <div key={status} className="mb-3.5">
          <div className="mb-1.5 flex justify-between gap-2 text-[12.5px]">
            <span className="whitespace-nowrap font-medium text-slate-700">{status}</span>
            <span className="font-mono text-slate-500">
              {count}
              <span className="ml-1.5 text-slate-400">{pct}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded transition-[width]"
              style={{ width: `${pct}%`, background: (STATUS_COLORS[status] ?? { fg: '#475569' }).fg }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentRow({ ticket, projectId }: { ticket: TicketSummary; projectId: string }) {
  const showHierarchy = useViewPrefs((s) => s.showHierarchy);
  const breadcrumb = [ticket.epic?.key, ticket.story?.key].filter(Boolean).join(' ▸ ');

  return (
    <Link
      to="/projects/$projectId/tickets/$ticketId"
      params={{ projectId, ticketId: ticket.id }}
      className="flex flex-col gap-1 border-b border-slate-100 px-2 py-2.5 last:border-0 hover:bg-slate-50"
    >
      <div className="flex justify-between gap-2">
        <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-indigo-400">{ticket.key}</span>
        <StatusBadge status={ticket.status} />
      </div>
      {showHierarchy && breadcrumb && (
        <div className="truncate text-[10.5px] text-slate-300">{breadcrumb}</div>
      )}
      <div className="text-[13px] font-medium leading-[1.3] text-slate-800">{ticket.title}</div>
      <div className="text-[11.5px] text-slate-400">
        {ticket.assignee ? `${ticket.assignee.name} · ` : ''}
        {relativeTime(ticket.updatedAt)}
      </div>
    </Link>
  );
}
