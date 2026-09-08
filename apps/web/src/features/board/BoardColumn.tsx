import { useDroppable } from '@dnd-kit/core';
import type { TicketSummary } from '@ticket-tracker/shared';
import { BoardCard } from './BoardCard';

interface Props {
  status: string;
  tickets: TicketSummary[];
  projectId: string;
  /** False while dragging a card whose type can't take this status (spec 04). */
  accepts: boolean;
  dragging: boolean;
}

export function BoardColumn({ status, tickets, projectId, accepts, dragging }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !accepts });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] min-w-[170px] flex-1 flex-col rounded-xl p-3 transition-colors ${
        isOver && accepts ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-[#eef0f3]'
      } ${dragging && !accepts ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between gap-1.5 px-1.5 pb-3 pt-1">
        <div className="truncate text-[12px] font-semibold text-slate-700">{status}</div>
        <div className="flex-none rounded-lg bg-white px-[7px] py-px font-mono text-[11px] text-slate-400">
          {tickets.length}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {tickets.map((ticket) => (
          <BoardCard key={ticket.id} ticket={ticket} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}
