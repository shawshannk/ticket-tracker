import { PRIORITY_COLORS, STATUS_COLORS, TYPE_COLORS, type TicketPriority, type TicketType } from '@ticket-tracker/shared';
import type { ReactNode } from 'react';

/**
 * The prototype's pill badges, driven by the shared colour palettes so the API, the board and
 * every list agree on what a status or priority looks like. Reused by M9-M11.
 */
function Pill({ fg, bg, children }: { fg: string; bg: string; children: ReactNode }) {
  return (
    <span
      className="inline-block whitespace-nowrap rounded-[9px] px-[7px] py-px text-[10.5px] font-semibold capitalize"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/** Status has no DB enum — an unknown value still renders rather than crashing. */
const NEUTRAL = { fg: '#475569', bg: '#f1f5f9' };

export const StatusBadge = ({ status }: { status: string }) => {
  const { fg, bg } = STATUS_COLORS[status] ?? NEUTRAL;
  return <Pill fg={fg} bg={bg}>{status}</Pill>;
};

export const PriorityBadge = ({ priority }: { priority: TicketPriority }) => {
  const { fg, bg } = PRIORITY_COLORS[priority];
  return <Pill fg={fg} bg={bg}>{priority}</Pill>;
};

export const TypeBadge = ({ type }: { type: TicketType }) => {
  const { fg, bg } = TYPE_COLORS[type];
  return <Pill fg={fg} bg={bg}>{type}</Pill>;
};
