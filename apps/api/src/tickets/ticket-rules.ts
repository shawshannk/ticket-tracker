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
      `"${status}" is not a valid status for a ${type} (allowed: ${STATUS_BY_TYPE[type].join(', ')})`,
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
    throw new BadRequestException(`Only a bug can link to a story (this ticket is a ${type})`);
  }
}
