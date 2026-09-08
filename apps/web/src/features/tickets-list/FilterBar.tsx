import {
  ALL_STATUSES,
  TICKET_ENVS,
  TICKET_PRIORITIES,
  TICKET_TYPES,
  type TicketListQuery,
  type TicketSummary,
  type User,
} from '@ticket-tracker/shared';
import { useViewPrefs, type Density } from '../../store/viewPrefs';

interface Props {
  query: TicketListQuery;
  users: User[];
  epics: TicketSummary[];
  onChange: (patch: Partial<TicketListQuery>) => void;
}

/** "All" is the absent value — selecting it clears the param rather than sending a sentinel. */
function Select({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      className="rounded-[7px] border border-slate-200 bg-white px-2.5 py-[7px] text-[12.5px] capitalize"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function FilterBar({ query, users, epics, onChange }: Props) {
  const { density, showHierarchy, tagStyle, setDensity, setShowHierarchy, setTagStyle } = useViewPrefs();

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <Select
        value={query.status} allLabel="All statuses"
        options={ALL_STATUSES.map((s) => ({ value: s, label: s }))}
        onChange={(status) => onChange({ status })}
      />
      <Select
        value={query.priority} allLabel="All priorities"
        options={TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))}
        onChange={(priority) => onChange({ priority: priority as TicketListQuery['priority'] })}
      />
      <Select
        value={query.assignee} allLabel="All assignees"
        options={users.map((u) => ({ value: u.id, label: u.name }))}
        onChange={(assignee) => onChange({ assignee })}
      />
      <Select
        value={query.env} allLabel="All environments"
        options={TICKET_ENVS.map((e) => ({ value: e, label: e }))}
        onChange={(env) => onChange({ env: env as TicketListQuery['env'] })}
      />
      <Select
        value={query.epic} allLabel="All epics"
        options={epics.map((e) => ({ value: e.id, label: `${e.key} ${e.title}` }))}
        onChange={(epic) => onChange({ epic })}
      />
      <Select
        value={query.type} allLabel="All types"
        options={TICKET_TYPES.map((t) => ({ value: t, label: t }))}
        onChange={(type) => onChange({ type: type as TicketListQuery['type'] })}
      />

      <div className="flex-1" />

      {/* R10 — client-only display preferences, deliberately not in the URL. */}
      <div className="flex items-center gap-1 rounded-[7px] border border-slate-200 bg-white p-0.5">
        {(['comfortable', 'compact'] as Density[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDensity(d)}
            className={`rounded-[5px] px-2 py-1 text-[11.5px] font-medium capitalize ${
              density === d ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setShowHierarchy(!showHierarchy)}
        className={`rounded-[7px] border px-2.5 py-[7px] text-[11.5px] font-medium ${
          showHierarchy ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'
        }`}
        title="Show the Epic ▸ Story breadcrumb on each row"
      >
        Hierarchy
      </button>
      <button
        type="button"
        onClick={() => setTagStyle(tagStyle === 'colorful' ? 'neutral' : 'colorful')}
        className={`rounded-[7px] border px-2.5 py-[7px] text-[11.5px] font-medium ${
          tagStyle === 'colorful' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'
        }`}
        title="Colorful or neutral label chips"
      >
        Tags
      </button>

    </div>
  );
}
