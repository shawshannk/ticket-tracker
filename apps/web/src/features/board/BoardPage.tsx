import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { BACKLOG_SPRINT, TICKET_TYPES, type BoardQuery, type TicketSummary, type TicketType } from '@ticket-tracker/shared';
import { useMemo, useState } from 'react';
import { useBoard, useSprints } from '../../api/queries';
import { ErrorPanel, LoadingPanel } from '../../components/states';
import { BoardCard } from './BoardCard';
import { BoardColumn } from './BoardColumn';
import { canDrop, columnsFor, groupByStatus } from './columns';
import { withDefaults, withFilter } from './searchParams';
import { useOptimisticMove } from './useOptimisticMove';

/**
 * Spec 04. The API returns a flat filtered list; grouping into columns happens here because
 * which columns exist is a presentation concern that depends on the Type filter.
 */
export function BoardPage() {
  const { projectId } = useParams({ from: '/_authed/projects/$projectId/board' });
  const search = useSearch({ from: '/_authed/projects/$projectId/board' });
  const query = useMemo(() => withDefaults(search), [search]);
  const navigate = useNavigate();

  const { data: cards, isPending, error, refetch } = useBoard(projectId, query);
  const { data: sprints = [] } = useSprints(projectId);
  const move = useOptimisticMove(projectId, query);

  const [dragged, setDragged] = useState<TicketSummary | null>(null);

  // A drag must start as a drag, not as a swallowed click — 5px lets the card's key link work.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const setQuery = (patch: Partial<BoardQuery>) =>
    navigate({ to: '/projects/$projectId/board', params: { projectId }, search: withFilter(query, patch) });

  const columns = columnsFor(query.type);
  const grouped = useMemo(() => groupByStatus(cards ?? [], columns), [cards, columns]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const ticket = active.data.current as TicketSummary | undefined;
    const status = over?.id as string | undefined;
    // No target, unchanged status, or a column this type can't take → nothing to do.
    if (!ticket || !status || status === ticket.status || !canDrop(ticket, status)) return;
    move.mutate({ id: ticket.id, status });
  };

  if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;

  return (
    <div className="h-full overflow-x-auto px-8 pb-14 pt-[22px]">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2.5">
          <span className="text-[12.5px] font-medium text-slate-500">Type</span>
          <select
            value={query.type ?? ''}
            onChange={(e) => setQuery({ type: (e.target.value || undefined) as TicketType | undefined })}
            className="rounded-[7px] border border-slate-200 bg-white px-2.5 py-[7px] text-[12.5px] capitalize"
          >
            <option value="">All</option>
            {TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2.5">
          <span className="text-[12.5px] font-medium text-slate-500">Sprint</span>
          <select
            value={query.sprint ?? ''}
            onChange={(e) => setQuery({ sprint: e.target.value || undefined })}
            className="rounded-[7px] border border-slate-200 bg-white px-2.5 py-[7px] text-[12.5px]"
          >
            <option value="">All</option>
            <option value={BACKLOG_SPRINT}>Backlog (no sprint)</option>
            {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        {move.isError && (
          <span className="text-[12.5px] font-medium text-rose-700">
            Move failed — the card snapped back. {(move.error as Error).message}
          </span>
        )}
      </div>

      {isPending ? (
        <LoadingPanel label="Loading board…" />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={({ active }: DragStartEvent) => setDragged(active.data.current as TicketSummary)}
          onDragCancel={() => setDragged(null)}
          onDragEnd={onDragEnd}
        >
          <div className="flex min-w-[1080px] items-start gap-3.5">
            {columns.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tickets={grouped[status] ?? []}
                projectId={projectId}
                // Spec 04 prefers preventing an invalid drop over rejecting it after the fact.
                accepts={!dragged || canDrop(dragged, status)}
                dragging={Boolean(dragged)}
              />
            ))}
          </div>

          {/* Follows the cursor while the original stays faded in place. */}
          <DragOverlay>
            {dragged && (
              <div className="w-[170px] rotate-1 opacity-90">
                <BoardCard ticket={dragged} projectId={projectId} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
