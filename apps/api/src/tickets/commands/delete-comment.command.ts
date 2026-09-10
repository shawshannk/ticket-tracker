import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';
import type { AuthContext } from '../../auth/auth-context';
import { assertCanDeleteComment } from '../../auth/ownership';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { comments, tickets } from '../../db/schema';

export class DeleteCommentCommand {
  constructor(
    readonly id: string,
    readonly auth: AuthContext,
  ) {}
}

/**
 * `DELETE /comments/:id` — the author, or a project admin (spec 10 §3.3).
 *
 * Wider than editing on purpose: removing a comment is moderation, altering one is
 * impersonation. `assertCanDeleteComment` is where that distinction lives.
 */
@CommandHandler(DeleteCommentCommand)
export class DeleteCommentHandler implements ICommandHandler<DeleteCommentCommand, void> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id, auth }: DeleteCommentCommand): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: comments.id, authorId: comments.authorId, ticketId: comments.ticketId })
        .from(comments)
        .where(eq(comments.id, id))
        .limit(1);
      if (!current) {
        throw new NotFoundException(`Comment ${id} not found`);
      }

      assertCanDeleteComment(auth, current);

      await tx.delete(comments).where(eq(comments.id, id));
      await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, current.ticketId));
    });
  }
}
