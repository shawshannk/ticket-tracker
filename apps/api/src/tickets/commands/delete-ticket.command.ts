import { ConflictException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { eq, or } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { comments, tickets } from '../../db/schema';

export class DeleteTicketCommand {
  constructor(readonly id: string) {}
}

/**
 * `DELETE /tickets/:id` — Admin/Manager only, enforced by a route-level `@Roles` since the
 * gate doesn't depend on the body.
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

  async execute({ id }: DeleteTicketCommand): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: tickets.id, key: tickets.key })
        .from(tickets)
        .where(eq(tickets.id, id))
        .limit(1);
      if (!current) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

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
