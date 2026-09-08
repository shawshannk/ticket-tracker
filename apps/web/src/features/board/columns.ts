import { ALL_STATUSES, STATUS_BY_TYPE, type TicketSummary, type TicketType } from '@ticket-tracker/shared';

/**
 * Spec 04: the column set depends on the Type filter — Epic shows its own three statuses,
 * Story/Bug share six, and "All" shows the union. `ALL_STATUSES` (added in M6b) is already in
 * that union order, so the board and the overview's breakdown agree on ordering.
 */
export function columnsFor(type: TicketType | undefined): readonly string[] {
  return type ? STATUS_BY_TYPE[type] : ALL_STATUSES;
}

/**
 * A card may only be dropped into a status valid for **its own** type — a Bug can't go to
 * "Planned" even when the board is showing the union of columns. Spec 04 prefers preventing
 * the drop over rejecting it afterwards, so this drives whether a column accepts the drag.
 *
 * The server enforces the same rule independently (R1); this is UX, not the control.
 */
export function canDrop(ticket: TicketSummary, status: string): boolean {
  return STATUS_BY_TYPE[ticket.type].includes(status);
}

export function groupByStatus(
  tickets: TicketSummary[],
  columns: readonly string[],
): Record<string, TicketSummary[]> {
  const grouped: Record<string, TicketSummary[]> = Object.fromEntries(columns.map((c) => [c, []]));
  for (const ticket of tickets) {
    // A status outside the visible column set (possible under a type filter mismatch) is
    // dropped from the board rather than silently creating a phantom column.
    grouped[ticket.status]?.push(ticket);
  }
  return grouped;
}
