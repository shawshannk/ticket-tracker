import type { TicketDetail, TicketUpdateDto } from '@ticket-tracker/shared';
import { useEffect, useMemo, useState } from 'react';

/** The fields spec 05 lists as editable on the detail view. */
export const EDITABLE_FIELDS = [
  'status', 'priority', 'assigneeId', 'env', 'size', 'startDate', 'estimatedEndDate', 'sprintId', 'epicId', 'storyId',
] as const;

export type Draft = Pick<TicketUpdateDto, (typeof EDITABLE_FIELDS)[number]>;

export function draftFrom(ticket: TicketDetail): Draft {
  return {
    status: ticket.status,
    priority: ticket.priority,
    assigneeId: ticket.assigneeId,
    env: ticket.env,
    size: ticket.size,
    startDate: ticket.startDate,
    estimatedEndDate: ticket.estimatedEndDate,
    sprintId: ticket.sprintId,
    epicId: ticket.epicId,
    storyId: ticket.storyId,
  };
}

/** Nullish values are equivalent — an unset date is null from the API but '' from an input. */
function same(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  return a === b;
}

/** Only the fields that actually changed, so a PATCH never rewrites untouched columns. */
export function changedFields(draft: Draft, ticket: TicketDetail): TicketUpdateDto {
  const original = draftFrom(ticket);
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (!same(draft[field], original[field])) patch[field] = draft[field];
  }
  return patch as TicketUpdateDto;
}

/**
 * Spec 05's draft/dirty pattern, kept deliberately rather than "fixed": edits live in local
 * state and only reach the API on an explicit Save, so a half-finished edit never hits the
 * server and Save can stay disabled until something actually changed.
 */
export function useTicketDraft(ticket: TicketDetail | undefined) {
  const [draft, setDraft] = useState<Draft | null>(null);

  // Re-seed when a different ticket loads, or when the server's copy changes after a save.
  useEffect(() => {
    if (ticket) setDraft(draftFrom(ticket));
  }, [ticket?.id, ticket?.updatedAt]);

  const patch = useMemo(
    () => (ticket && draft ? changedFields(draft, ticket) : {}),
    [draft, ticket],
  );

  return {
    draft,
    setField: <K extends keyof Draft>(field: K, value: Draft[K]) =>
      setDraft((d) => (d ? { ...d, [field]: value } : d)),
    reset: () => ticket && setDraft(draftFrom(ticket)),
    patch,
    isDirty: Object.keys(patch).length > 0,
  };
}
