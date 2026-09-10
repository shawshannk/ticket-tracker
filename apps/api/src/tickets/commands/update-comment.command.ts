import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { Comment, CommentUpdateDto } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { AuthContext } from '../../auth/auth-context';
import { assertCanEditComment } from '../../auth/ownership';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { comments, tickets } from '../../db/schema';

export class UpdateCommentCommand {
  constructor(
    readonly id: string,
    readonly input: CommentUpdateDto,
    readonly auth: AuthContext,
  ) {}
}

/**
 * `PATCH /comments/:id` — the author, and nobody else (spec 10 §3.3).
 *
 * `@ProjectScope('comment')` has already 404'd anyone outside the ticket's project, so the row
 * loaded here is one the caller may at least see. The authorship check is the whole remaining
 * control, and it is here rather than in a guard because it needs the row.
 */
@CommandHandler(UpdateCommentCommand)
export class UpdateCommentHandler implements ICommandHandler<UpdateCommentCommand, Comment> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id, input, auth }: UpdateCommentCommand): Promise<Comment> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (!current) {
        throw new NotFoundException(`Comment ${id} not found`);
      }

      assertCanEditComment(auth, current);

      const [row] = await tx
        .update(comments)
        .set({ body: input.body })
        .where(eq(comments.id, id))
        .returning();

      // Editing a comment is activity on the ticket, exactly as adding one is (spec 00:
      // updated_at moves on every change), so the "recently updated" ordering must see it.
      await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, current.ticketId));

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
