import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  can,
  ENV_COLORS,
  NEUTRAL_TAG,
  SEVERITY_COLORS,
  TAG_PALETTE,
  TICKET_ENVS,
  TICKET_PRIORITIES,
  TICKET_SIZES,
  TYPE_COLORS,
  type TicketDetail,
} from '@ticket-tracker/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useDeleteTicket, useSprints, useTicket, useTickets, useUpdateTicket, useUsers } from '../../api/queries';
import { formatDate, relativeTime } from '../../components/relativeTime';
import { ErrorPanel, LoadingPanel } from '../../components/states';
import { AppShell } from '../../layout/AppShell';
import { useActingUserStore } from '../../store/actingUser';
import { useViewPrefs } from '../../store/viewPrefs';
import { Comments } from './Comments';
import { useTicketDraft } from './useTicketDraft';

export function TicketDetailPage() {
  const { projectId, ticketId } = useParams({ from: '/projects/$projectId/tickets/$ticketId' });
  const { data: ticket, isPending, error, refetch } = useTicket(ticketId);

  return (
    <AppShell title={<DetailHeading projectId={projectId} ticket={ticket} />}>
      {isPending ? (
        <LoadingPanel label="Loading ticket…" />
      ) : error ? (
        <ErrorPanel error={error} onRetry={() => refetch()} />
      ) : (
        <Loaded ticket={ticket} projectId={projectId} />
      )}
    </AppShell>
  );
}

/** Spec 05's header: a link back to the list, then the ticket's key and title. */
function DetailHeading({ projectId, ticket }: { projectId: string; ticket?: TicketDetail }) {
  return (
    <>
      <Link
        to="/projects/$projectId/tickets"
        params={{ projectId }}
        className="text-[13px] font-medium text-slate-500 hover:text-slate-900"
      >
        Tickets
      </Link>
      <span className="text-slate-300">/</span>
      {ticket && <span className="font-mono text-[14px] text-indigo-500">{ticket.key}</span>}
      <span className="truncate">{ticket?.title ?? 'Ticket'}</span>
    </>
  );
}

function Loaded({ ticket, projectId }: { ticket: TicketDetail; projectId: string }) {
  const navigate = useNavigate();
  const { draft, setField, patch, isDirty } = useTicketDraft(ticket);
  const update = useUpdateTicket(projectId);
  const remove = useDeleteTicket(projectId);

  const { data: users = [] } = useUsers();
  const { data: sprints = [] } = useSprints(projectId);
  const { data: epicPage } = useTickets(projectId, { type: 'epic', pageSize: 100 });

  const actingUserId = useActingUserStore((s) => s.actingUserId);
  const actingRole = users.find((u) => u.id === actingUserId)?.role;
  // Spec 05: delete is Admin/Manager only. Hiding it is UX — the server enforces it (R3).
  const canDelete = can('deleteTicket', actingRole);

  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(0), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const { showHierarchy, tagStyle } = useViewPrefs();
  if (!draft) return <LoadingPanel />;

  const isBug = ticket.type === 'bug';
  const isStoryOrBug = ticket.type !== 'epic';
  const type = TYPE_COLORS[ticket.type];
  const breadcrumb = [ticket.epic, ticket.story].filter(Boolean).map((t) => `${t!.key} ${t!.title}`).join('  ▸  ');

  const save = () =>
    update.mutate({ id: ticket.id, body: patch }, { onSuccess: () => setSavedAt(Date.now()) });

  const onDelete = () => {
    if (!window.confirm(`Delete ${ticket.key}? This cannot be undone.`)) return;
    remove.mutate(ticket.id, {
      onSuccess: () => navigate({ to: '/projects/$projectId/tickets', params: { projectId } }),
    });
  };

  return (
    <div className="grid max-w-[1180px] grid-cols-1 gap-[22px] px-8 pb-14 pt-[26px] lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {showHierarchy && breadcrumb && <div className="mb-2 truncate text-[12px] text-slate-400">{breadcrumb}</div>}

        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <span className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase" style={{ background: type.bg, color: type.fg }}>
            {ticket.type}
          </span>
          <span className="font-mono text-[12px] font-semibold text-indigo-400">{ticket.key}</span>
          {ticket.severity && (
            <span
              className="rounded-lg px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: SEVERITY_COLORS[ticket.severity].bg, color: SEVERITY_COLORS[ticket.severity].fg }}
            >
              Sev {ticket.severity}
            </span>
          )}
          {ticket.env && (
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: ENV_COLORS[ticket.env].bg, color: ENV_COLORS[ticket.env].fg }}
            >
              {ticket.env}
            </span>
          )}
        </div>

        <h1 className="mb-4 text-[22px] font-bold leading-[1.3] tracking-[-0.3px]">{ticket.title}</h1>

        {ticket.labels.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {ticket.labels.map((label, i) => {
              const { fg, bg } = tagStyle === 'colorful' ? TAG_PALETTE[i % TAG_PALETTE.length] : NEUTRAL_TAG;
              return (
                <span key={label} className="rounded-md px-2.5 py-0.5 text-[11px] font-medium" style={{ background: bg, color: fg }}>
                  {label}
                </span>
              );
            })}
          </div>
        )}

        <section className="mb-[18px] rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.4px] text-slate-400">Description</h2>
          <div className="whitespace-pre-wrap text-[13.5px] leading-[1.65] text-slate-700">
            {ticket.description || <span className="text-slate-400">No description.</span>}
          </div>
        </section>

        <Comments ticketId={ticket.id} projectId={projectId} comments={ticket.comments} />
      </div>

      <aside className="flex flex-col gap-3.5">
        <Panel>
          {/* statusOptions comes from the API, computed from this ticket's type (spec 05). */}
          <Field label="Status">
            <Select value={draft.status ?? ''} onChange={(v) => setField('status', v)} options={ticket.statusOptions.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Priority">
            <Select value={draft.priority ?? ''} onChange={(v) => setField('priority', v as never)} options={TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))} />
          </Field>
          <Field label="Assignee" last>
            <Select value={draft.assigneeId ?? ''} onChange={(v) => setField('assigneeId', v || null)} options={users.map((u) => ({ value: u.id, label: u.name }))} allLabel="Unassigned" />
          </Field>
          {isBug && (
            <Field label="Environment" last>
              <Select value={draft.env ?? ''} onChange={(v) => setField('env', (v || null) as never)} options={TICKET_ENVS.map((e) => ({ value: e, label: e }))} allLabel="—" />
            </Field>
          )}
        </Panel>

        {isStoryOrBug && (
          <Panel>
            <Field label="Epic" last={!isBug}>
              <Select value={draft.epicId ?? ''} onChange={(v) => setField('epicId', v || null)} options={(epicPage?.items ?? []).map((e) => ({ value: e.id, label: `${e.key} ${e.title}` }))} allLabel="—" />
            </Field>
            {isBug && (
              // storyOptions is server-computed and already limited to this ticket's epic.
              <Field label="Story" last>
                <Select value={draft.storyId ?? ''} onChange={(v) => setField('storyId', v || null)} options={ticket.storyOptions.map((s) => ({ value: s.id, label: `${s.key} ${s.title}` }))} allLabel="—" />
              </Field>
            )}
          </Panel>
        )}

        <Panel>
          {isStoryOrBug && (
            <>
              <Field label="Sprint">
                <Select value={draft.sprintId ?? ''} onChange={(v) => setField('sprintId', v || null)} options={sprints.map((s) => ({ value: s.id, label: s.name }))} allLabel="Backlog" />
              </Field>
              <Field label="Size estimate">
                <Select value={draft.size ?? ''} onChange={(v) => setField('size', (v || null) as never)} options={TICKET_SIZES.map((s) => ({ value: s, label: s.toUpperCase() }))} allLabel="—" />
              </Field>
            </>
          )}
          <Field label="Start date">
            <input type="date" value={draft.startDate ?? ''} onChange={(e) => setField('startDate', e.target.value || null)} className={inputClass} />
          </Field>
          <Field label="Estimated end date" last>
            <input type="date" value={draft.estimatedEndDate ?? ''} onChange={(e) => setField('estimatedEndDate', e.target.value || null)} className={inputClass} />
          </Field>

          <button
            type="button"
            onClick={save}
            // Spec 05: disabled until something actually changed, "Saved ✓" briefly after.
            disabled={!isDirty || update.isPending}
            className={`mt-4 w-full rounded-lg px-3 py-2.5 text-[12.5px] font-semibold ${
              isDirty && !update.isPending
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : savedAt
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'cursor-default bg-slate-100 text-slate-400'
            }`}
          >
            {update.isPending ? 'Saving…' : savedAt && !isDirty ? 'Saved ✓' : 'Save changes'}
          </button>
          {update.isError && <p className="mt-2 text-[12px] text-rose-700">{(update.error as Error).message}</p>}

          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={remove.isPending}
              className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-[12.5px] font-semibold text-red-700 hover:bg-rose-50 disabled:opacity-50"
            >
              {remove.isPending ? 'Deleting…' : 'Delete ticket'}
            </button>
          )}
          {remove.isError && <p className="mt-2 text-[12px] text-rose-700">{(remove.error as Error).message}</p>}
        </Panel>

        <Panel>
          <dl className="flex flex-col gap-2.5 text-[12.5px] text-slate-600">
            <Meta term="Reporter"><span className="font-medium text-slate-800">{ticket.reporter}</span></Meta>
            <Meta term="Created">{formatDate(ticket.createdAt)}</Meta>
            <Meta term="Updated">{relativeTime(ticket.updatedAt)}</Meta>
          </dl>
        </Panel>
      </aside>
    </div>
  );
}

const inputClass = 'w-full rounded-[7px] border border-slate-200 bg-white px-2.5 py-[7px] text-[12.5px]';

const Panel = ({ children }: { children: ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4">{children}</section>
);

const Field = ({ label, last, children }: { label: string; last?: boolean; children: ReactNode }) => (
  <div className={last ? '' : 'mb-3.5'}>
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400">{label}</div>
    {children}
  </div>
);

const Meta = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-400">{term}</dt>
    <dd className="truncate">{children}</dd>
  </div>
);

function Select({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} capitalize`}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
