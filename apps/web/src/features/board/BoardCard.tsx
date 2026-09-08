import { useDraggable } from '@dnd-kit/core';
import { ENV_COLORS, PRIORITY_COLORS, TYPE_COLORS, type TicketSummary } from '@ticket-tracker/shared';
import { Link } from '@tanstack/react-router';
import { initials } from '../../layout/useDismissable';
import { useViewPrefs } from '../../store/viewPrefs';

export function BoardCard({ ticket, projectId }: { ticket: TicketSummary; projectId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id, data: ticket });
  const { density, showHierarchy } = useViewPrefs();

  const type = TYPE_COLORS[ticket.type];
  const priority = PRIORITY_COLORS[ticket.priority];
  const breadcrumb = [ticket.epic?.key, ticket.story?.key].filter(Boolean).join(' ▸ ');

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // The dragged card keeps its slot but fades, so the columns don't reflow mid-drag.
      className={`cursor-grab touch-none rounded-[9px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-indigo-200 ${
        density === 'compact' ? 'p-2' : 'p-2.5'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="mb-[7px] flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="flex h-[15px] w-[15px] flex-none items-center justify-center rounded text-[9.5px] font-bold uppercase"
            style={{ background: type.bg, color: type.fg }}
          >
            {ticket.type[0]}
          </span>
          <Link
            to="/projects/$projectId/tickets/$ticketId"
            params={{ projectId, ticketId: ticket.id }}
            // Stop the pointer sensor claiming the click so the key stays a real link.
            onPointerDown={(e) => e.stopPropagation()}
            className="whitespace-nowrap font-mono text-[10.5px] font-semibold text-indigo-400 hover:underline"
          >
            {ticket.key}
          </Link>
        </div>
        <span
          className="whitespace-nowrap rounded-lg px-1.5 py-px text-[10px] font-bold capitalize"
          style={{ background: priority.bg, color: priority.fg }}
        >
          {ticket.priority}
        </span>
      </div>

      {showHierarchy && breadcrumb && (
        <div className="mb-1 truncate text-[10px] text-slate-400">{breadcrumb}</div>
      )}

      <div className="mb-2 text-[12.5px] font-medium leading-[1.35] text-slate-800">{ticket.title}</div>

      <div className="flex items-center justify-between gap-1.5">
        {ticket.env ? (
          <span
            className="whitespace-nowrap rounded-md px-1.5 py-px text-[10.5px] font-semibold"
            style={{ background: ENV_COLORS[ticket.env].bg, color: ENV_COLORS[ticket.env].fg }}
          >
            {ticket.env}
          </span>
        ) : (
          <span />
        )}
        <span className="whitespace-nowrap text-[11px] text-slate-400">
          {ticket.assignee ? initials(ticket.assignee.name) : '—'}
        </span>
      </div>
    </div>
  );
}
