import { BadRequestException } from '@nestjs/common';
import { STATUS_BY_TYPE, type TicketType } from '@ticket-tracker/shared';

/**
 * The server-side ticket rules from specs/00. Pure functions, no DB — the commands do the
 * loading and pass the values in, so every rule is unit-testable and shared between create
 * (M5a) and update/move (M5b) rather than reimplemented per command.
 */

/** Status a new ticket starts in: the first column of its type's set (spec 00). */
export function defaultStatusFor(type: TicketType): string {
  return STATUS_BY_TYPE[type][0];
}

export function isValidStatusFor(type: TicketType, status: string): boolean {
  return STATUS_BY_TYPE[type].includes(status);
}

/**
 * Status is `text` in the DB precisely because its valid set depends on `type`, so this is
 * the only thing standing between a direct API call and a Bug in "Planned" (spec 00, R1).
 */
export function assertValidStatus(type: TicketType, status: string): void {
  if (!isValidStatusFor(type, status)) {
    throw new BadRequestException(
      `"${status}" is not a valid status for type "${type}" (allowed: ${STATUS_BY_TYPE[type].join(', ')})`,
    );
  }
}

/**
 * R5 / spec 00: a Bug may link to both an Epic and a Story, but then the linked Story must
 * sit under that same Epic — otherwise the hierarchy contradicts itself.
 *
 * @param epicId the ticket's own epic link
 * @param storyId the ticket's own story link
 * @param linkedStoryEpicId `epic_id` of the ticket identified by `storyId`, or null/undefined
 *   when there is no story to check
 */
export function assertEpicStoryConsistency(
  epicId: string | null | undefined,
  storyId: string | null | undefined,
  linkedStoryEpicId: string | null | undefined,
): void {
  if (!epicId || !storyId) {
    return;
  }
  if (linkedStoryEpicId !== epicId) {
    throw new BadRequestException(
      `Story ${storyId} belongs to epic ${linkedStoryEpicId ?? 'none'}, not epic ${epicId} — ` +
        'a bug cannot link to a story outside its own epic',
    );
  }
}

/** Only Bugs carry a story link (spec 00: story_id is "Bug only"). */
export function assertStoryLinkAllowed(type: TicketType, storyId: string | null | undefined): void {
  if (storyId && type !== 'bug') {
    throw new BadRequestException(`Only a bug can link to a story (ticket type: ${type})`);
  }
}

/**
 * Fields that only exist on some ticket types (spec 00): severity is Bug-only, and the
 * story/bug detail fields don't exist on an Epic. Create enforces this through the
 * discriminated union; update has a flat schema, so it needs this check — otherwise
 * `PATCH /tickets/:id` is a back door to an Epic with a severity.
 *
 * Clearing a field (explicit null) is always allowed; only setting a value is restricted.
 */
const STORY_BUG_ONLY_FIELDS = ['env', 'size', 'startDate', 'estimatedEndDate', 'sprintId', 'epicId'] as const;

export function assertFieldsAllowedForType(
  type: TicketType,
  input: Partial<Record<string, unknown>>,
): void {
  if (input.severity != null && type !== 'bug') {
    throw new BadRequestException(`Only a bug has a severity (ticket type: ${type})`);
  }

  if (type === 'epic') {
    for (const field of STORY_BUG_ONLY_FIELDS) {
      if (input[field] != null) {
        throw new BadRequestException(`An epic has no ${field}`);
      }
    }
  }

  assertStoryLinkAllowed(type, input.storyId as string | null | undefined);
}
