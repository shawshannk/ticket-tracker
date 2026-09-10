import { ForbiddenException } from '@nestjs/common';
import { can } from '@ticket-tracker/shared';
import type { AuthContext } from './auth-context';

/**
 * R14: the rules that cannot be decided from the route, because they need the row.
 *
 * These run in the command handlers, *after* the record is loaded and *before* the write — not
 * in a guard, which has no row, and not only in the UI, which is not enforcement. By the time
 * one of these is called, ProjectScopeGuard has already established that the caller is a member
 * of the ticket's project (R12), so the only question left is what they own.
 *
 * Kept as free functions rather than a service: they are pure decisions over
 * `(AuthContext, row)`, and pure functions are what makes the exhaustive unit tests in
 * `ownership.spec.ts` cheap enough to actually be exhaustive.
 */

/**
 * Spec 10 §3.3: the reporter, or a project manager/admin.
 *
 * **Reads `reporterId` and never the `reporter` display-name text.** v1 stored the reporter as a
 * denormalized name; matching on that would mean two people called "Sam Rivera" could delete
 * each other's tickets, and a rename would silently move delete rights. A null `reporterId` —
 * a pre-M15 row whose backfill found no matching user — simply fails the ownership branch and
 * falls back to the role check, which is the safe direction.
 */
export function assertCanDeleteTicket(auth: AuthContext, ticket: { reporterId: string | null }): void {
  if (can('ticket.delete', auth.projectRole)) return;
  if (ticket.reporterId !== null && ticket.reporterId === auth.user.id) return;

  throw new ForbiddenException('Only the reporter or a project manager can delete this ticket');
}

/**
 * Spec 10 §3.3: the reporter, the current assignee, or a project manager/admin.
 *
 * Narrower than editing a ticket's other fields on purpose — reassignment is a way to make work
 * disappear from someone's queue without their knowledge, which editing a label is not.
 */
export function assertCanAssignTicket(
  auth: AuthContext,
  ticket: { reporterId: string | null; assigneeId: string | null },
): void {
  if (can('ticket.assign', auth.projectRole)) return;
  if (ticket.reporterId !== null && ticket.reporterId === auth.user.id) return;
  if (ticket.assigneeId !== null && ticket.assigneeId === auth.user.id) return;

  throw new ForbiddenException(
    'Only the reporter, the current assignee, or a project manager can reassign this ticket',
  );
}

/**
 * Spec 10 §3.3: **the author only — not even a project admin.**
 *
 * The one rule here with no role escape hatch, and it is deliberate: a comment is attributable
 * speech. An admin may remove one (moderation, below) but may never alter it and leave the
 * author's name on it. If a future change adds an admin bypass here, it is changing the spec,
 * not fixing a bug.
 */
export function assertCanEditComment(auth: AuthContext, comment: { authorId: string }): void {
  if (comment.authorId === auth.user.id) return;

  throw new ForbiddenException('You can only edit your own comments');
}

/** Spec 10 §3.3: the author, or a project admin — moderation, as distinct from editing. */
export function assertCanDeleteComment(auth: AuthContext, comment: { authorId: string }): void {
  if (comment.authorId === auth.user.id) return;
  // Not `can(...)`: this is the only project rule that admits admins but not managers, so there
  // is no matrix row for it (the tech spec's §5 map has none either). Spelling the role out
  // beats inventing a one-role action that reads like the others but isn't.
  if (auth.projectRole === 'admin') return;

  throw new ForbiddenException('Only the author or a project admin can delete this comment');
}
