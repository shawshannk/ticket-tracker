import { useNavigate, useParams } from '@tanstack/react-router';
import {
  can,
  TICKET_ENVS,
  TICKET_PRIORITIES,
  TICKET_SEVERITIES,
  TICKET_SIZES,
  TICKET_TYPES,
  TYPE_COLORS,
  type TicketType,
} from '@ticket-tracker/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCreateTicket, useSprints, useTickets, useUsers } from '../../api/queries';
import { useActingUserStore } from '../../store/actingUser';
import { buildPayload, emptyForm, validate, type CreateForm } from './buildPayload';

export function CreateTicketPage() {
  const { projectId } = useParams({ from: '/projects/$projectId/create' });
  const navigate = useNavigate();

  const [form, setForm] = useState<CreateForm>(() => emptyForm());
  const [submitted, setSubmitted] = useState(false);

  const { data: users = [] } = useUsers();
  const { data: sprints = [] } = useSprints(projectId);
  const { data: epicPage } = useTickets(projectId, { type: 'epic', pageSize: 100 });
  const epics = epicPage?.items ?? [];

  // Spec 06: the Story dropdown is filtered to stories under the *currently selected* epic,
  // which can change while the form is open — so this is a live query, not a static list.
  const { data: storyPage } = useTickets(
    projectId,
    form.epicId ? { type: 'story', epic: form.epicId, pageSize: 100 } : { type: 'story', pageSize: 1 },
  );
  const stories = form.epicId ? (storyPage?.items ?? []) : [];

  const actingUserId = useActingUserStore((s) => s.actingUserId);
  const actingRole = users.find((u) => u.id === actingUserId)?.role;
  // Spec 06: the Epic option is *hidden* for Developers, not merely disabled. The server
  // re-checks this (M5a) — hiding it is only UX.
  const allowedTypes = TICKET_TYPES.filter((t) => t !== 'epic' || can('createEpic', actingRole));

  const create = useCreateTicket(projectId);
  const set = <K extends keyof CreateForm>(field: K, value: CreateForm[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  // If the acting user switches to a Developer while "epic" is selected, fall back rather
  // than leaving a type they can't submit.
  useEffect(() => {
    if (!allowedTypes.includes(form.type)) setForm((f) => ({ ...emptyForm('story'), ...f, type: 'story' }));
  }, [allowedTypes.join(), form.type]);

  // Changing epic invalidates any story chosen under the previous one (R5).
  useEffect(() => {
    if (form.storyId && !stories.some((s) => s.id === form.storyId)) set('storyId', '');
  }, [form.epicId, stories.length]);

  const errors = useMemo(() => validate(form), [form]);
  const isBug = form.type === 'bug';
  const isStoryOrBug = form.type !== 'epic';
  const needsEpic = isStoryOrBug && epics.length === 0;

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    create.mutate(buildPayload(form), {
      // Spec 06: land on the new ticket's detail view.
      onSuccess: (ticket) =>
        navigate({ to: '/projects/$projectId/tickets/$ticketId', params: { projectId, ticketId: ticket.id } }),
    });
  };

  const show = (field: string) => (submitted ? errors[field] : undefined);

  return (
    <div className="max-w-[640px] px-8 pb-14 pt-[30px]">
      <div className="rounded-xl border border-slate-200 bg-white p-[26px]">
        <Label>Type</Label>
        <div className="mb-[18px] flex gap-2">
          {allowedTypes.map((type) => {
            const active = form.type === type;
            const { fg, bg } = TYPE_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => setForm((f) => ({ ...emptyForm(type), title: f.title, description: f.description }))}
                className="flex-1 rounded-lg border px-2.5 py-2.5 text-[13px] font-semibold capitalize"
                style={
                  active
                    ? { background: bg, color: fg, borderColor: fg }
                    : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
                }
              >
                {type}
              </button>
            );
          })}
        </div>

        <Label>Title</Label>
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Short summary"
          className={`mb-1 w-full rounded-lg border px-2.5 py-2 text-[14px] outline-none ${show('title') ? 'border-rose-300' : 'border-slate-200'}`}
        />
        <FieldError message={show('title')} />

        <Label className="mt-4">Description</Label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Steps to reproduce, expected vs actual behavior…"
          className="mb-[18px] min-h-[110px] w-full resize-y rounded-lg border border-slate-200 px-2.5 py-2 text-[13.5px] outline-none"
        />

        <Row>
          <Cell label="Priority">
            <Select value={form.priority} onChange={(v) => set('priority', v)} options={TICKET_PRIORITIES} />
          </Cell>
          {isBug && (
            <Cell label="Severity">
              <Select value={form.severity} onChange={(v) => set('severity', v)} options={TICKET_SEVERITIES} />
            </Cell>
          )}
        </Row>

        <Row>
          <Cell label="Assignee">
            <Select
              value={form.assigneeId}
              onChange={(v) => set('assigneeId', v)}
              options={users.map((u) => u.id)}
              labels={Object.fromEntries(users.map((u) => [u.id, u.name]))}
              allLabel="Unassigned"
            />
          </Cell>
          {isBug && (
            <Cell label="Environment">
              <Select value={form.env} onChange={(v) => set('env', v)} options={TICKET_ENVS} />
            </Cell>
          )}
        </Row>

        {isStoryOrBug && (
          <Row>
            <Cell label="Epic" error={show('epicId')}>
              <Select
                value={form.epicId}
                onChange={(v) => set('epicId', v)}
                options={epics.map((e) => e.id)}
                labels={Object.fromEntries(epics.map((e) => [e.id, `${e.key} ${e.title}`]))}
                allLabel={needsEpic ? 'No epics yet' : 'Select an epic…'}
                invalid={Boolean(show('epicId'))}
              />
            </Cell>
            {isBug && (
              <Cell label="Story (optional)">
                <Select
                  value={form.storyId}
                  onChange={(v) => set('storyId', v)}
                  options={stories.map((s) => s.id)}
                  labels={Object.fromEntries(stories.map((s) => [s.id, `${s.key} ${s.title}`]))}
                  allLabel={form.epicId ? 'None' : 'Pick an epic first'}
                />
              </Cell>
            )}
          </Row>
        )}

        <div className="mb-[22px] grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {isStoryOrBug && (
            <>
              <Cell label="Sprint">
                <Select
                  value={form.sprintId}
                  onChange={(v) => set('sprintId', v)}
                  options={sprints.map((s) => s.id)}
                  labels={Object.fromEntries(sprints.map((s) => [s.id, s.name]))}
                  allLabel="Backlog"
                />
              </Cell>
              <Cell label="Size">
                <Select
                  value={form.size}
                  onChange={(v) => set('size', v)}
                  options={TICKET_SIZES}
                  labels={Object.fromEntries(TICKET_SIZES.map((s) => [s, s.toUpperCase()]))}
                />
              </Cell>
            </>
          )}
          <Cell label="Start date">
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
          </Cell>
          <Cell label="Est. end date">
            <input type="date" value={form.estimatedEndDate} onChange={(e) => set('estimatedEndDate', e.target.value)} className={inputClass} />
          </Cell>
        </div>

        <Label>Tags (comma separated)</Label>
        <input
          value={form.labels}
          onChange={(e) => set('labels', e.target.value)}
          placeholder="frontend, api"
          className="mb-[22px] w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none"
        />

        {needsEpic && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            A story or bug must belong to an epic, and this project has none yet — create an epic first.
          </p>
        )}
        {create.isError && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
            {(create.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-[18px]">
          <button
            type="button"
            onClick={() => navigate({ to: '/projects/$projectId/tickets', params: { projectId } })}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            className="rounded-lg bg-indigo-600 px-[18px] py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px]';

/** Enum values are lowercase on the wire; only the first letter is displayed capitalised. */
const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const Label = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400 ${className}`}>{children}</div>
);

const Row = ({ children }: { children: ReactNode }) => (
  <div className="mb-[18px] grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div>
);

const Cell = ({ label, error, children }: { label: string; error?: string; children: ReactNode }) => (
  <div>
    <Label>{label}</Label>
    {children}
    <FieldError message={error} />
  </div>
);

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="mt-1 text-[12px] text-rose-700">{message}</p> : null;

function Select({
  value,
  onChange,
  options,
  labels,
  allLabel,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
  allLabel?: string;
  invalid?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} ${invalid ? 'border-rose-300' : ''}`}
    >
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{labels?.[o] ?? sentenceCase(o)}</option>
      ))}
    </select>
  );
}
