import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { Ticket, TicketUpdateDto } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db';
import type { AuthContext } from '../../auth/auth-context';
import { assertCanAssignTicket } from '../../auth/ownership';
import { DB } from '../../db/db.module';
import { tickets } from '../../db/schema';
import { toTicket } from '../ticket.mapper';
import { assertParentLinks } from '../ticket-links';
import { assertFieldsAllowedForType, assertValidStatus } from '../ticket-rules';

export class UpdateTicketCommand {
  constructor(
    readonly id: string,
    readonly input: TicketUpdateDto,
    readonly auth: AuthContext,
  ) {}
}

/**
 * `PATCH /tickets/:id` — the detail view's Save (spec 05). Editing stays open to every project
 * member: a tracker where a developer cannot fix a wrong label on someone else's bug is one
 * people route around (spec 10 §3.3). **Reassignment is the exception** — see the ownership
 * check below.
 */
@CommandHandler(UpdateTicketCommand)
export class UpdateTicketHandler implements ICommandHandler<UpdateTicketCommand, Ticket> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id, input, auth }: UpdateTicketCommand): Promise<Ticket> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(tickets).where(eq(tickets.id, id)).limit(1);
      if (!current) {
        throw new NotFoundException(`Ticket ${id} not found`);
      }

      // R14: only a *change* of assignee is gated, and only against the stored row. A PATCH that
      // resends the current assignee alongside other edits is not a reassignment and must not be
      // refused as one — the detail view sends the whole form on Save.
      if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
        assertCanAssignTicket(auth, current);
      }

      // `type` is immutable after creation, so every rule is checked against the stored type,
      // never anything the request claims.
      if (input.status !== undefined) {
        assertValidStatus(current.type, input.status);
      }

      // The update schema is flat, so without this a PATCH could give an epic a severity.
      assertFieldsAllowedForType(current.type, input);

      // Re-validate the hierarchy whenever either link moves — the pair has to stay
      // consistent (R5), and the new target has to be in this ticket's project (R2).
      const touchesLinks = input.epicId !== undefined || input.storyId !== undefined;
      if (touchesLinks) {
        const epicId = input.epicId !== undefined ? input.epicId : current.epicId;
        const storyId = input.storyId !== undefined ? input.storyId : current.storyId;
        await assertParentLinks(tx, {
          projectId: current.projectId,
          type: current.type,
          epicId,
          storyId,
        });
      }

      // An empty PATCH is a no-op rather than an error (Drizzle rejects `set({})`), matching
      // how M3 handles PATCH /users/:id.
      if (Object.keys(input).length === 0) {
        return toTicket(current);
      }

      const [row] = await tx
        .update(tickets)
        // `updated_at` only defaults on insert, so every mutation has to set it explicitly —
        // the overview's "recently updated" and avg-resolution figures depend on it (spec 00).
        .set({ ...input, updatedAt: new Date() })
        .where(eq(tickets.id, id))
        .returning();

      return toTicket(row);
    });
  }
}
