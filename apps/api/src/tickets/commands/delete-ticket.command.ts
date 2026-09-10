import { ConflictException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { eq, or } from 'drizzle-orm';
import type { Db } from '../../db';
import type { AuthContext } from '../../auth/auth-context';
import { assertCanDeleteTicket } from '../../auth/ownership';
import { DB } from '../../db/db.module';
import { comments, tickets } from '../../db/schema';

export class DeleteTicketCommand {
  constructor(
    readonly id: string,
    readonly auth: AuthContext,
  ) {}
}

/**
 * `DELETE /tickets/:id` — a project manager/admin, **or the ticket's reporter** (spec 10 §3.3).
 * The reporter half needs the row, so the whole decision moved here from the route in M19; the
 * route now carries only `@ProjectScope('ticket')`.
 *
 * Neither spec 05 nor spec 00 says what to do about a ticket that still has children or
 * comments; decided with the user on 2026-09-08: **cascade comments, refuse children.**
 * Comments are owned by the ticket and meaningless without it, while an epic's stories are
 * real work that must not be silently orphaned or silently destroyed — so that case is a 409
 * telling the caller what to detach first.
 */
@CommandHandler(DeleteTicketCommand)
export class DeleteTicketHandler implements ICommandHandler<DeleteTicketCommand, void> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id, auth }: DeleteTicketCommand): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: tickets.id, key: tickets.key, reporterId: tickets.reporterId })
        .from(tickets)
        .where(eq(tickets.id, id))
        .limit(1);
      if (!current) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

      // Before the children check, so a developer probing someone else's epic learns "you may
      // not" rather than the keys of every ticket linked to it.
      assertCanDeleteTicket(auth, current);

      const children = await tx
        .select({ key: tickets.key })
        .from(tickets)
        .where(or(eq(tickets.epicId, id), eq(tickets.storyId, id)));

      if (children.length > 0) {
        throw new ConflictException(
          `Cannot delete ${current.key}: ${children.length} ticket(s) still link to it ` +
            `(${children.map((c) => c.key).join(', ')}). Unlink or delete them first.`,
        );
      }

      await tx.delete(comments).where(eq(comments.ticketId, id));
      await tx.delete(tickets).where(eq(tickets.id, id));
    });
  }
}
