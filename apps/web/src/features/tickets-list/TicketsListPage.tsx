import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ENV_COLORS, NEUTRAL_TAG, TAG_PALETTE, type TicketListQuery, type TicketSummary } from '@ticket-tracker/shared';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useTickets, useUsers } from '../../api/queries';
import { PriorityBadge, StatusBadge, TypeBadge } from '../../components/Badge';
import { formatDate } from '../../components/relativeTime';
import { ErrorPanel, LoadingPanel } from '../../components/states';
import { useViewPrefs } from '../../store/viewPrefs';
import { FilterBar } from './FilterBar';
import { useDebounced } from './useDebounced';
import { withDefaults, withFilter } from './searchParams';

const columnHelper = createColumnHelper<TicketSummary>();

/**
 * Spec 03. Filtering, search, sorting and paging all happen on the server (R8) — the table
 * renders whatever page the API returned and never filters an array itself.
 *
 * TanStack Table is used for the column model even though v1 has a fixed column set, so
 * sortable columns are a small change later (the API already accepts sortBy/sortDir).
 */
export function TicketsListPage() {
  const { projectId } = useParams({ from: '/_authed/projects/$projectId/tickets' });
  const search = useSearch({ from: '/_authed/projects/$projectId/tickets' });
  // The URL omits defaults for a clean, shareable link; the view and the API need them filled.
  const query = useMemo(() => withDefaults(search), [search]);
  const navigate = useNavigate();

  const setQuery = (patch: Partial<TicketListQuery>) =>
    navigate({
      to: '/projects/$projectId/tickets',
      params: { projectId },
      search: withFilter(query, patch),
    });

  // The input stays responsive while only the settled value reaches the URL and the API.
  const [searchInput, setSearchInput] = useState(query.search ?? '');
  const debouncedSearch = useDebounced(searchInput, 300);

  useEffect(() => {
    const next = debouncedSearch.trim() || undefined;
    if (next !== query.search) setQuery({ search: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keep the box in step when the URL changes from elsewhere (back button, a shared link).
  useEffect(() => setSearchInput(query.search ?? ''), [query.search]);

  const { data, isPending, isFetching, error, refetch } = useTickets(projectId, query);
  const { data: users = [] } = useUsers();
  // Epics for the filter dropdown; a project has few, so one unpaginated call is fine.
  const { data: epicPage } = useTickets(projectId, { type: 'epic', pageSize: 100 });

  const columns = useMemo(
    () => [
      columnHelper.accessor('type', {
        header: 'Type',
        cell: (c) => <TypeBadge type={c.getValue()} />,
      }),
      columnHelper.accessor('key', {
        header: 'Key',
        cell: (c) => <span className="whitespace-nowrap font-mono text-[11.5px] font-semibold text-indigo-500">{c.getValue()}</span>,
      }),
      columnHelper.accessor('title', { header: 'Title', cell: (c) => <TitleCell ticket={c.row.original} /> }),
      columnHelper.accessor('env', {
        header: 'Env',
        cell: (c) => {
          const env = c.getValue();
          if (!env) return null;
          const { fg, bg } = ENV_COLORS[env];
          return (
            <span className="whitespace-nowrap rounded-md px-[7px] py-0.5 text-[10.5px] font-semibold" style={{ background: bg, color: fg }}>
              {env}
            </span>
          );
        },
      }),
      columnHelper.accessor('status', { header: 'Status', cell: (c) => <StatusBadge status={c.getValue()} /> }),
      columnHelper.accessor('priority', { header: 'Priority', cell: (c) => <PriorityBadge priority={c.getValue()} /> }),
      columnHelper.accessor((row) => row.assignee?.name ?? '—', {
        id: 'assignee',
        header: 'Assignee',
        cell: (c) => <span className="truncate text-[12.5px] text-slate-600">{c.getValue()}</span>,
      }),
      columnHelper.accessor('createdAt', {
        header: 'Created',
        cell: (c) => <span className="whitespace-nowrap text-[12px] text-slate-400">{formatDate(c.getValue())}</span>,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    // The server already paginated; the table must not slice the rows again.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  const density = useViewPrefs((s) => s.density);
  const rowPadding = density === 'compact' ? 'py-1.5' : 'py-3';

  if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;

  const total = data?.total ?? 0;
  const shown = data?.items.length ?? 0;
  const from = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const lastPage = Math.max(1, Math.ceil(total / query.pageSize));

  return (
    <div className="px-8 pb-14 pt-[22px]">
      {/* Search and the result count pair on one row; filters and view prefs on the next, so
          neither group orphans an item when the bar wraps on a narrow window. */}
      <div className="mb-3 flex items-center gap-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search tickets, keys, people…"
          className="w-[320px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-indigo-300 focus:bg-white"
        />
        <span className="whitespace-nowrap text-[12.5px] text-slate-400">
          {total === 0 ? 'No tickets' : `${from}–${from + shown - 1} of ${total} tickets`}
        </span>
      </div>

      <FilterBar query={query} users={users} epics={epicPage?.items ?? []} onChange={setQuery} />

      <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${isFetching ? 'opacity-70' : ''}`}>
        <table className="w-full min-w-[820px] table-fixed border-collapse">
          <colgroup>
            {['52px', '78px', 'auto', '92px', '104px', '92px', '110px', '104px'].map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-slate-200">
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-400 first:pl-[18px] last:pr-[18px]"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isPending ? (
              <tr><td colSpan={8}><LoadingPanel label="Loading tickets…" /></td></tr>
            ) : shown === 0 ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-[13.5px] text-slate-400">
                  No tickets match your filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() =>
                    navigate({
                      to: '/projects/$projectId/tickets/$ticketId',
                      params: { projectId, ticketId: row.original.id },
                    })
                  }
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={`px-2 align-middle first:pl-[18px] last:pr-[18px] ${rowPadding}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > query.pageSize && (
        <div className="mt-3.5 flex items-center justify-end gap-2 text-[12.5px]">
          <span className="mr-1 text-slate-400">Page {query.page} of {lastPage}</span>
          <PagerButton disabled={query.page <= 1} onClick={() => setQuery({ page: query.page - 1 })}>Previous</PagerButton>
          <PagerButton disabled={query.page >= lastPage} onClick={() => setQuery({ page: query.page + 1 })}>Next</PagerButton>
        </div>
      )}
    </div>
  );
}

function PagerButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function TitleCell({ ticket }: { ticket: TicketSummary }) {
  const { showHierarchy, tagStyle } = useViewPrefs();
  const breadcrumb = [ticket.epic?.key, ticket.story?.key].filter(Boolean).join(' ▸ ');

  return (
    <div className="min-w-0">
      {showHierarchy && breadcrumb && <div className="truncate text-[10px] text-slate-400">{breadcrumb}</div>}
      <div className="truncate pr-3 text-[13.5px] font-medium text-slate-800">{ticket.title}</div>
      {ticket.labels.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {ticket.labels.map((label, i) => {
            const { fg, bg } = tagStyle === 'colorful' ? TAG_PALETTE[i % TAG_PALETTE.length] : NEUTRAL_TAG;
            return (
              <span key={label} className="rounded px-1.5 text-[10px] font-medium" style={{ background: bg, color: fg }}>
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
