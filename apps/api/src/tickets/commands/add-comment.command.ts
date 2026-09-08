import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { Comment, CommentCreateDto, User } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { comments, tickets } from '../../db/schema';

export class AddCommentCommand {
  constructor(
    readonly ticketId: string,
    readonly input: CommentCreateDto,
    readonly actingUser: User,
  ) {}
}

/**
 * `POST /tickets/:id/comments`. R6 / spec 05: `author_id` is the acting user, taken
 * server-side — the prototype hardcoded every comment's author to "Jordan Lee" regardless of
 * who was selected. The request body carries only `body`; an author in the payload would be
 * ignored by the schema, and must never be honoured.
 */
@CommandHandler(AddCommentCommand)
export class AddCommentHandler implements ICommandHandler<AddCommentCommand, Comment> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ ticketId, input, actingUser }: AddCommentCommand): Promise<Comment> {
    return this.db.transaction(async (tx) => {
      const [ticket] = await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1);
      if (!ticket) {
        throw new NotFoundException(`Ticket ${ticketId} not found`);
      }

      const [row] = await tx
        .insert(comments)
        .values({ ticketId, authorId: actingUser.id, body: input.body })
        .returning();

      // Commenting is activity on the ticket, so the detail/overview "recently updated"
      // ordering should reflect it (spec 00: updated_at moves on every change).
      await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticketId));

      return {
        id: row.id,
        ticketId: row.ticketId,
        authorId: row.authorId,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
