import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { STATUS_BY_TYPE, type TicketDetail, type TicketRef } from '@ticket-tracker/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { comments, tickets, users } from '../../db/schema';
import { toTicket } from '../ticket.mapper';
import { assignee, epic, story } from './ticket-summary';

export class GetTicketDetailQuery {
  constructor(readonly id: string) {}
}

/**
 * `GET /tickets/:id` (spec 05). Everything the detail view renders in one response:
 * the row, the names behind its ids, its comments with authors, the statuses it may take
 * (from its type — the same table the write side validates against), and the stories it
 * could link to.
 */
@QueryHandler(GetTicketDetailQuery)
export class GetTicketDetailHandler implements IQueryHandler<GetTicketDetailQuery, TicketDetail> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id }: GetTicketDetailQuery): Promise<TicketDetail> {
    const [row] = await this.db
      .select({
        ticket: tickets,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        epicId: epic.id,
        epicKey: epic.key,
        epicTitle: epic.title,
        storyId: story.id,
        storyKey: story.key,
        storyTitle: story.title,
      })
      .from(tickets)
      .leftJoin(assignee, eq(tickets.assigneeId, assignee.id))
      .leftJoin(epic, eq(tickets.epicId, epic.id))
      .leftJoin(story, eq(tickets.storyId, story.id))
      .where(eq(tickets.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }

    const ticket = toTicket(row.ticket);

    const [commentRows, storyOptions] = await Promise.all([
      this.db
        .select({ comment: comments, authorName: users.name })
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.ticketId, id))
        .orderBy(asc(comments.createdAt), asc(comments.id)),
      // The story-link dropdown only exists on bugs (spec 05/06), and only makes sense once
      // an epic is chosen; scoped to the project as well as the epic so no cross-project row
      // can ever be offered (R2).
      ticket.type === 'bug' && ticket.epicId ? this.loadStoryOptions(ticket.projectId, ticket.epicId) : Promise.resolve([]),
    ]);

    return {
      ...ticket,
      assignee: row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
      epic: row.epicId && row.epicKey && row.epicTitle ? { id: row.epicId, key: row.epicKey, title: row.epicTitle } : null,
      story:
        row.storyId && row.storyKey && row.storyTitle ? { id: row.storyId, key: row.storyKey, title: row.storyTitle } : null,
      comments: commentRows.map(({ comment, authorName }) => ({
        id: comment.id,
        ticketId: comment.ticketId,
        authorId: comment.authorId,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: { id: comment.authorId, name: authorName },
      })),
      statusOptions: [...STATUS_BY_TYPE[ticket.type]],
      storyOptions,
    };
  }

  private loadStoryOptions(projectId: string, epicId: string): Promise<TicketRef[]> {
    return this.db
      .select({ id: tickets.id, key: tickets.key, title: tickets.title })
      .from(tickets)
      .where(and(eq(tickets.projectId, projectId), eq(tickets.type, 'story'), eq(tickets.epicId, epicId)))
      .orderBy(asc(tickets.key));
  }
}
