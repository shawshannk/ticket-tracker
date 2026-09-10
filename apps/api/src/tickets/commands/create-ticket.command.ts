import { ForbiddenException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { can, type Ticket, type TicketCreateDto } from '@ticket-tracker/shared';
import type { Db } from '../../db';
import type { AuthContext } from '../../auth/auth-context';
import { DB } from '../../db/db.module';
import { tickets } from '../../db/schema';
import { TicketKeyService } from '../../projects/ticket-key.service';
import { toTicket } from '../ticket.mapper';
import { assertParentLinks } from '../ticket-links';
import { defaultStatusFor } from '../ticket-rules';

export class CreateTicketCommand {
  constructor(
    readonly projectId: string,
    readonly input: TicketCreateDto,
    /** The full request context: the epic gate reads the *project* role, not the global one. */
    readonly auth: AuthContext,
  ) {}
}

@CommandHandler(CreateTicketCommand)
export class CreateTicketHandler implements ICommandHandler<CreateTicketCommand, Ticket> {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ticketKeys: TicketKeyService,
  ) {}

  async execute({ projectId, input, auth }: CreateTicketCommand): Promise<Ticket> {
    // The frontend hides the Epic option from Developers; spec 06 requires re-checking it here,
    // because hiding a control is UX, not enforcement. It can't be a route-level decorator since
    // it depends on the body's `type`.
    //
    // R13: the role consulted is `auth.projectRole`, resolved by ProjectScopeGuard for *this*
    // project — a global manager who is a developer here cannot create an epic here, and a
    // global developer who is a manager here can.
    if (input.type === 'epic' && !can('ticket.createEpic', auth.projectRole)) {
      throw new ForbiddenException(`Project role "${auth.projectRole ?? 'none'}" cannot create an epic`);
    }

    // One transaction: the key allocation and the insert succeed or fail together, so a
    // rejected insert doesn't burn a sequence number (spec 02).
    return this.db.transaction(async (tx) => {
      const epicId = input.type === 'epic' ? null : input.epicId;
      const storyId = input.type === 'bug' ? (input.storyId ?? null) : null;

      await assertParentLinks(tx, { projectId, type: input.type, epicId, storyId });

      const { key } = await this.ticketKeys.allocate(projectId, tx);

      const [row] = await tx
        .insert(tickets)
        .values({
          projectId,
          key,
          type: input.type,
          title: input.title,
          description: input.description,
          // A new ticket starts in the first column of its own type's set — never client-supplied.
          status: defaultStatusFor(input.type),
          priority: input.priority,
          // Epics carry none of the story/bug detail fields, and only bugs carry severity
          // (spec 00). The discriminated union already keeps them off the payload; nulling
          // here means the stored row can't drift from that shape either.
          severity: input.type === 'bug' ? input.severity : null,
          assigneeId: input.assigneeId ?? null,
          // spec 06's open question, resolved in PLAN.md: reporter is the acting user, never
          // client-supplied. `reporter` is the free-text display name v1 stored; `reporterId` is
          // the FK M15 added and the only thing M19's ownership check may read — a ticket created
          // without it would silently fall through to the manager/admin branch forever.
          reporter: auth.user.name,
          reporterId: auth.user.id,
          labels: input.labels,
          env: input.type === 'epic' ? null : input.env,
          size: input.type === 'epic' ? null : input.size,
          epicId,
          storyId,
          sprintId: input.type === 'epic' ? null : (input.sprintId ?? null),
          startDate: input.type === 'epic' ? null : (input.startDate ?? null),
          estimatedEndDate: input.type === 'epic' ? null : (input.estimatedEndDate ?? null),
        })
        .returning();

      return toTicket(row);
    });
  }
}
