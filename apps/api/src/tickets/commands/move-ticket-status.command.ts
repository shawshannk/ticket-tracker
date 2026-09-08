import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { MoveTicketStatusDto, Ticket } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { tickets } from '../../db/schema';
import { toTicket } from '../ticket.mapper';
import { assertValidStatus } from '../ticket-rules';

export class MoveTicketStatusCommand {
  constructor(
    readonly id: string,
    readonly input: MoveTicketStatusDto,
  ) {}
}

/**
 * `PATCH /tickets/:id/status` — the board's drag-drop endpoint (spec 04). Kept separate from
 * the general update so the board can move a card without sending the whole ticket, and so
 * the optimistic-update path (R9) has a narrow endpoint to hit.
 *
 * The type-validity check is the whole point: the frontend not offering an invalid drop
 * target is UX, and the API can be called directly.
 */
@CommandHandler(MoveTicketStatusCommand)
export class MoveTicketStatusHandler implements ICommandHandler<MoveTicketStatusCommand, Ticket> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id, input }: MoveTicketStatusCommand): Promise<Ticket> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ type: tickets.type })
        .from(tickets)
        .where(eq(tickets.id, id))
        .limit(1);
      if (!current) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

      assertValidStatus(current.type, input.status);

      const [row] = await tx
        .update(tickets)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(tickets.id, id))
        .returning();

      return toTicket(row);
    });
  }
}
